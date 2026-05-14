import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { analyzeCoupling } from './analyzers/coupling.js';
import { analyzeDuplication } from './analyzers/duplication.js';
import { analyzeDeadCode } from './analyzers/deadcode.js';
import { openDb, saveSnapshot, getHistory, getSnapshot, getLatestTwo } from './store/db.js';
import { getGitInfo } from './utils/git.js';
import { formatDate, formatScore, formatDelta, scoreBar } from './utils/format.js';

const program = new Command();

program
  .name('entropy-monitor')
  .description('Tracks codebase disorder over time')
  .version('0.1.0');

// ─── scan ────────────────────────────────────────────────────────────────────
program
  .command('scan')
  .description('Scan a codebase and record an entropy snapshot')
  .argument('[path]', 'root of the codebase to scan', '.')
  .option('--top <n>', 'show top N results', '10')
  .option('--skip-duplication', 'skip duplication analysis')
  .option('--skip-deadcode', 'skip dead code analysis')
  .option('--no-save', 'print results but do not save to history')
  .action(async (targetPath: string, opts: {
    top: string;
    skipDuplication: boolean;
    skipDeadcode: boolean;
    save: boolean;
  }) => {
    const root = path.resolve(targetPath);
    const topN = parseInt(opts.top, 10);

    const s1 = ora('Analyzing coupling…').start();
    const coupling = await analyzeCoupling(root);
    s1.succeed('Coupling analysis done');

    let duplication;
    if (!opts.skipDuplication) {
      const s2 = ora('Analyzing duplication…').start();
      duplication = await analyzeDuplication(root);
      s2.succeed('Duplication analysis done');
    }

    let deadCode;
    if (!opts.skipDeadcode) {
      const s3 = ora('Analyzing dead code…').start();
      deadCode = await analyzeDeadCode(root);
      s3.succeed('Dead code analysis done');
    }

    const scores = [coupling.score];
    if (duplication) scores.push(duplication.score);
    if (deadCode) scores.push(deadCode.score);
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Save to DB
    let snapshotId: number | null = null;
    if (opts.save !== false) {
      const db = openDb(root);
      const git = getGitInfo(root);
      snapshotId = saveSnapshot(db, {
        coupling,
        duplication,
        deadCode,
        overallScore,
        gitSha: git.sha ?? undefined,
        gitBranch: git.branch ?? undefined,
      });
      db.close();
    }

    // Print report
    console.log('');
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log(chalk.bold('  Entropy Monitor Report'));
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log('');
    console.log(`  Overall entropy:   ${formatScore(overallScore)}  ${scoreBar(overallScore)}`);
    console.log(`  Coupling score:    ${formatScore(coupling.score)}`);
    if (duplication) console.log(`  Duplication score: ${formatScore(duplication.score)}  (${duplication.percentage}% dup lines)`);
    if (deadCode)    console.log(`  Dead code score:   ${formatScore(deadCode.score)}  (${deadCode.items.length} issues)`);
    console.log('');
    console.log(chalk.dim(`  Files scanned:      ${coupling.totalFiles}`));
    if (duplication) console.log(chalk.dim(`  Total lines:        ${duplication.totalLines}`));
    if (deadCode) {
      console.log(chalk.dim(`  Unused exports:     ${deadCode.unusedExports}`));
      console.log(chalk.dim(`  Unused files:       ${deadCode.unusedFiles}`));
      console.log(chalk.dim(`  Unresolved imports: ${deadCode.unresolvedImports}`));
    }
    if (snapshotId) console.log(chalk.dim(`  Snapshot ID:        #${snapshotId}`));
    console.log('');

    // Coupling table
    console.log(chalk.bold('Most coupled files:'));
    [...coupling.modules]
      .sort((a, b) => b.fanOut - a.fanOut)
      .slice(0, topN)
      .filter(m => m.fanOut > 0 || m.fanIn > 0)
      .forEach(m => {
        const bar = instBar(m.instability);
        console.log(
          `  ${chalk.cyan(m.filePath.padEnd(48))}` +
          `  out:${String(m.fanOut).padStart(3)}` +
          `  in:${String(m.fanIn).padStart(3)}` +
          `  ${bar} ${m.instability.toFixed(2)}`
        );
      });

    // Duplication table
    if (duplication) {
      console.log('');
      if (duplication.duplicateBlocks.length > 0) {
        console.log(chalk.bold('Duplicate blocks:'));
        duplication.duplicateBlocks
          .sort((a, b) => b.lines - a.lines)
          .slice(0, topN)
          .forEach(d => console.log(
            `  ${chalk.yellow(d.file1)}:${d.startLine1}` +
            chalk.dim(' ↔ ') +
            `${chalk.yellow(d.file2)}:${d.startLine2}` +
            chalk.dim(` (${d.lines} lines)`)
          ));
      } else {
        console.log(chalk.green('  No duplicate blocks found.'));
      }
    }

    // Dead code table
    if (deadCode) {
      console.log('');
      if (deadCode.items.length > 0) {
        console.log(chalk.bold('Dead code issues:'));
        deadCode.items
          .filter(i => i.type === 'unused-file')
          .slice(0, topN)
          .forEach(i => console.log(`    ${chalk.red('✗')} ${i.filePath}`));
        deadCode.items
          .filter(i => i.type === 'unused-export')
          .slice(0, topN)
          .forEach(i => console.log(`    ${chalk.yellow('~')} ${i.filePath} ${chalk.dim('→')} ${i.name}`));
        deadCode.items
          .filter(i => i.type === 'unresolved-import')
          .slice(0, topN)
          .forEach(i => console.log(`    ${chalk.red('?')} ${i.filePath} ${chalk.dim('→')} ${i.name}`));
      } else {
        console.log(chalk.green('  No dead code found.'));
      }
    }

    console.log('');
  });

// ─── history ─────────────────────────────────────────────────────────────────
program
  .command('history')
  .description('Show entropy trend over time')
  .argument('[path]', 'root of the codebase', '.')
  .option('--limit <n>', 'number of snapshots to show', '20')
  .action((targetPath: string, opts: { limit: string }) => {
    const root = path.resolve(targetPath);
    const db = openDb(root);
    const rows = getHistory(db, parseInt(opts.limit, 10));
    db.close();

    if (rows.length === 0) {
      console.log(chalk.yellow('No snapshots yet. Run `entropy-monitor scan` first.'));
      return;
    }

    console.log('');
    console.log(chalk.bold('  Entropy History'));
    console.log(chalk.dim('  ' + '─'.repeat(72)));
    console.log(
      chalk.dim('  #    Date                  Overall  Coupling  Dup  Dead  Branch')
    );
    console.log(chalk.dim('  ' + '─'.repeat(72)));

    for (const row of [...rows].reverse()) {
      const branch = row.git_branch ? chalk.dim(row.git_branch) : chalk.dim('—');
      const sha = row.git_sha ? chalk.dim(` (${row.git_sha})`) : '';
      console.log(
        `  ${String(row.id).padStart(3)}  ` +
        `${chalk.dim(formatDate(row.timestamp).padEnd(22))}` +
        `  ${formatScore(row.overall_score)}` +
        `  ${formatScore(row.coupling_score).padEnd(8)}` +
        `  ${formatScore(row.duplication_score).padEnd(4)}` +
        `  ${formatScore(row.deadcode_score).padEnd(4)}` +
        `  ${branch}${sha}`
      );
    }

    // Mini spark chart
    console.log('');
    console.log(chalk.bold('  Trend (overall entropy):'));
    const spark = [...rows].reverse().map(r => sparkChar(r.overall_score));
    console.log('  ' + spark.join(''));
    console.log(chalk.dim('  oldest' + ' '.repeat(spark.length - 12) + 'latest'));
    console.log('');
  });

// ─── diff ─────────────────────────────────────────────────────────────────────
program
  .command('diff')
  .description('Compare two snapshots')
  .argument('[path]', 'root of the codebase', '.')
  .option('--from <id>', 'snapshot ID to compare from (default: second latest)')
  .option('--to <id>', 'snapshot ID to compare to (default: latest)')
  .action((targetPath: string, opts: { from?: string; to?: string }) => {
    const root = path.resolve(targetPath);
    const db = openDb(root);

    let prev, curr;
    if (opts.from && opts.to) {
      prev = getSnapshot(db, parseInt(opts.from, 10));
      curr = getSnapshot(db, parseInt(opts.to, 10));
    } else {
      [curr, prev] = getLatestTwo(db);
    }
    db.close();

    if (!curr) {
      console.log(chalk.yellow('Not enough snapshots. Run `entropy-monitor scan` at least once.'));
      return;
    }
    if (!prev) {
      console.log(chalk.yellow('Only one snapshot exists. Run scan again to compare.'));
      return;
    }

    console.log('');
    console.log(chalk.bold('  Entropy Diff'));
    console.log(chalk.dim(`  From: #${prev.id}  ${formatDate(prev.timestamp)}`));
    console.log(chalk.dim(`  To:   #${curr.id}  ${formatDate(curr.timestamp)}`));
    console.log('');

    printDiffRow('Overall entropy',   prev.overall_score,    curr.overall_score);
    printDiffRow('Coupling score',    prev.coupling_score,   curr.coupling_score);
    printDiffRow('Duplication score', prev.duplication_score, curr.duplication_score);
    printDiffRow('Dead code score',   prev.deadcode_score,   curr.deadcode_score);
    console.log('');
    printCountRow('Total files',      prev.total_files,      curr.total_files);
    printCountRow('Total lines',      prev.total_lines,      curr.total_lines);
    printCountRow('Duplicate lines',  prev.duplicate_lines,  curr.duplicate_lines);
    printCountRow('Unused exports',   prev.unused_exports,   curr.unused_exports);
    printCountRow('Unused files',     prev.unused_files,     curr.unused_files);
    console.log('');
  });

program.parse();

// ─── helpers ──────────────────────────────────────────────────────────────────
function printDiffRow(label: string, prev: number, curr: number) {
  const delta = formatDelta(prev, curr);
  console.log(
    `  ${label.padEnd(22)} ${formatScore(prev)} → ${formatScore(curr)}${delta}`
  );
}

function printCountRow(label: string, prev: number, curr: number) {
  const delta = curr - prev;
  const deltaStr = delta === 0 ? chalk.dim('  ±0') : delta > 0 ? chalk.red(`  +${delta}`) : chalk.green(`  ${delta}`);
  console.log(
    `  ${label.padEnd(22)} ${String(prev).padStart(6)} → ${String(curr).padStart(6)}${deltaStr}`
  );
}

function instBar(value: number): string {
  const filled = Math.round(value * 10);
  return chalk.red('█'.repeat(filled)) + chalk.dim('░'.repeat(10 - filled));
}

function sparkChar(score: number): string {
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const idx = Math.min(7, Math.floor((score / 100) * 8));
  const color = score < 30 ? chalk.green : score < 60 ? chalk.yellow : chalk.red;
  return color(chars[idx]);
}