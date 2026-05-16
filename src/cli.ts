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
import { generateHtmlReport } from './reporters/html.js';

const program = new Command();

program
  .name('entropy-monitor')
  .description('Tracks codebase disorder over time')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan a codebase and record an entropy snapshot')
  .argument('[path]', 'root of the codebase to scan', '.')
  .option('--top <n>', 'show top N results', '10')
  .option('--skip-duplication', 'skip duplication analysis')
  .option('--skip-deadcode', 'skip dead code analysis')
  .option('--no-save', 'print results but do not save to history')
  .option('--json', 'output results as JSON instead of formatted report')
  .action(async (targetPath: string, opts: {
    top: string;
    skipDuplication: boolean;
    skipDeadcode: boolean;
    save: boolean;
    json: boolean;
  }) => {
    const root = path.resolve(targetPath);
    const topN = parseInt(opts.top, 10);

    // Run analyzers silently if --json mode
    const s1 = opts.json ? null : ora('Analyzing coupling…').start();
    const coupling = await analyzeCoupling(root);
    s1?.succeed('Coupling analysis done');

    let duplication;
    if (!opts.skipDuplication) {
      const s2 = opts.json ? null : ora('Analyzing duplication…').start();
      duplication = await analyzeDuplication(root);
      s2?.succeed('Duplication analysis done');
    }

    let deadCode;
    if (!opts.skipDeadcode) {
      const s3 = opts.json ? null : ora('Analyzing dead code…').start();
      deadCode = await analyzeDeadCode(root);
      s3?.succeed('Dead code analysis done');
    }

    const scores = [coupling.score];
    if (duplication) scores.push(duplication.score);
    if (deadCode) scores.push(deadCode.score);
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

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

    // JSON output mode — clean, parseable, no colors
    if (opts.json) {
      const jsonResult = {
        overallScore,
        couplingScore: coupling.score,
        duplicationScore: duplication?.score ?? 0,
        deadcodeScore: deadCode?.score ?? 0,
        totalFiles: coupling.totalFiles,
        totalLines: duplication?.totalLines ?? 0,
        duplicateLines: duplication?.duplicateLines ?? 0,
        duplicateBlocks: duplication?.duplicateBlocks.length ?? 0,
        unusedExports: deadCode?.unusedExports ?? 0,
        unusedFiles: deadCode?.unusedFiles ?? 0,
        unresolvedImports: deadCode?.unresolvedImports ?? 0,
        snapshotId,
        scannedAt: Date.now(),
      };
      process.stdout.write(JSON.stringify(jsonResult) + '\n');
      return;
    }

    // Normal formatted report (existing code below unchanged)
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
    console.log(chalk.dim('  #    Date                  Overall  Coupling  Dup   Dead  Branch'));
    console.log(chalk.dim('  ' + '─'.repeat(72)));

    for (const row of [...rows].reverse()) {
      const branch = row.git_branch ? chalk.dim(row.git_branch) : chalk.dim('—');
      const sha    = row.git_sha    ? chalk.dim(` (${row.git_sha})`) : '';
      console.log(
        `  ${String(row.id).padStart(3)}  ` +
        `${chalk.dim(formatDate(row.timestamp).padEnd(22))}` +
        `  ${formatScore(row.overall_score)}` +
        `   ${formatScore(row.coupling_score)}` +
        `  ${formatScore(row.duplication_score)}` +
        `  ${formatScore(row.deadcode_score)}` +
        `  ${branch}${sha}`
      );
    }

    console.log('');
    console.log(chalk.bold('  Trend (overall entropy):'));
    const spark = [...rows].reverse().map(r => sparkChar(r.overall_score));
    console.log('  ' + spark.join(''));
    console.log(chalk.dim('  oldest' + ' '.repeat(Math.max(0, spark.length - 12)) + 'latest'));
    console.log('');
  });

program
  .command('diff')
  .description('Compare two snapshots')
  .argument('[path]', 'root of the codebase', '.')
  .option('--from <id>', 'snapshot ID to compare from')
  .option('--to <id>',   'snapshot ID to compare to')
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

    if (!curr) { console.log(chalk.yellow('No snapshots found.')); return; }
    if (!prev) { console.log(chalk.yellow('Only one snapshot. Run scan again to compare.')); return; }

    console.log('');
    console.log(chalk.bold('  Entropy Diff'));
    console.log(chalk.dim(`  From: #${prev.id}  ${formatDate(prev.timestamp)}`));
    console.log(chalk.dim(`  To:   #${curr.id}  ${formatDate(curr.timestamp)}`));
    console.log('');
    printDiffRow('Overall entropy',    prev.overall_score,     curr.overall_score);
    printDiffRow('Coupling score',     prev.coupling_score,    curr.coupling_score);
    printDiffRow('Duplication score',  prev.duplication_score, curr.duplication_score);
    printDiffRow('Dead code score',    prev.deadcode_score,    curr.deadcode_score);
    console.log('');
    printCountRow('Total files',       prev.total_files,       curr.total_files);
    printCountRow('Total lines',       prev.total_lines,       curr.total_lines);
    printCountRow('Duplicate lines',   prev.duplicate_lines,   curr.duplicate_lines);
    printCountRow('Unused exports',    prev.unused_exports,    curr.unused_exports);
    printCountRow('Unused files',      prev.unused_files,      curr.unused_files);
    console.log('');
  });

program
  .command('report')
  .description('Generate an HTML dashboard')
  .argument('[path]', 'root of the codebase', '.')
  .option('--out <file>', 'output file path', 'entropy-report.html')
  .option('--limit <n>', 'number of snapshots to include', '50')
  .action((targetPath: string, opts: { out: string; limit: string }) => {
    const root = path.resolve(targetPath);
    const db = openDb(root);
    const rows = getHistory(db, parseInt(opts.limit, 10));
    db.close();

    if (rows.length === 0) {
      console.log(chalk.yellow('No snapshots yet. Run `entropy-monitor scan` first.'));
      return;
    }

    const outPath = path.resolve(opts.out);
    generateHtmlReport(rows, outPath);
    console.log(chalk.green(`\n  Report generated: ${outPath}\n`));
    console.log(chalk.dim('  Open it in any browser — no server needed.\n'));
  });

program
  .command('ci')
  .description('Fail if entropy regressed since last snapshot (for CI pipelines)')
  .argument('[path]', 'root of the codebase', '.')
  .option('--max-overall <n>',     'fail if overall score exceeds this', '70')
  .option('--max-coupling <n>',    'fail if coupling score exceeds this')
  .option('--max-duplication <n>', 'fail if duplication score exceeds this')
  .option('--max-deadcode <n>',    'fail if dead code score exceeds this')
  .option('--no-regression',       'only fail on regression vs last snapshot, not absolute threshold')
  .action((targetPath: string, opts: {
    maxOverall: string;
    maxCoupling?: string;
    maxDuplication?: string;
    maxDeadcode?: string;
    regression: boolean;
  }) => {
    const root = path.resolve(targetPath);
    const db = openDb(root);
    const [curr, prev] = getLatestTwo(db);
    db.close();

    if (!curr) {
      console.log(chalk.yellow('No snapshots found. Run `entropy-monitor scan` first.'));
      process.exit(0);
    }

    const failures: string[] = [];

    // Absolute threshold checks
    const maxOverall = parseInt(opts.maxOverall, 10);
    if (curr.overall_score > maxOverall) {
      failures.push(`Overall entropy ${curr.overall_score}/100 exceeds threshold ${maxOverall}/100`);
    }
    if (opts.maxCoupling && curr.coupling_score > parseInt(opts.maxCoupling, 10)) {
      failures.push(`Coupling ${curr.coupling_score}/100 exceeds threshold ${opts.maxCoupling}/100`);
    }
    if (opts.maxDuplication && curr.duplication_score > parseInt(opts.maxDuplication, 10)) {
      failures.push(`Duplication ${curr.duplication_score}/100 exceeds threshold ${opts.maxDuplication}/100`);
    }
    if (opts.maxDeadcode && curr.deadcode_score > parseInt(opts.maxDeadcode, 10)) {
      failures.push(`Dead code ${curr.deadcode_score}/100 exceeds threshold ${opts.maxDeadcode}/100`);
    }

    // Regression check vs previous snapshot
    if (prev) {
      if (curr.overall_score > prev.overall_score + 5) {
        failures.push(
          `Overall entropy regressed from ${prev.overall_score} to ${curr.overall_score} (+${curr.overall_score - prev.overall_score})`
        );
      }
    }

    console.log('');
    console.log(chalk.bold('  Entropy CI Gate'));
    console.log(`  Latest snapshot: #${curr.id}  ${formatDate(curr.timestamp)}`);
    console.log(`  Overall: ${formatScore(curr.overall_score)}  Coupling: ${formatScore(curr.coupling_score)}  Dup: ${formatScore(curr.duplication_score)}  Dead: ${formatScore(curr.deadcode_score)}`);
    console.log('');

    if (failures.length === 0) {
      console.log(chalk.green('  ✓ All entropy checks passed.\n'));
      process.exit(0);
    } else {
      console.log(chalk.red('  ✗ Entropy checks failed:'));
      failures.forEach(f => console.log(chalk.red(`    · ${f}`)));
      console.log('');
      process.exit(1);
    }
  });

program.parse();

function printReport(opts: {
  coupling: Awaited<ReturnType<typeof analyzeCoupling>>;
  duplication?: Awaited<ReturnType<typeof analyzeDuplication>>;
  deadCode?: Awaited<ReturnType<typeof analyzeDeadCode>>;
  overallScore: number;
  snapshotId: number | null;
  topN: number;
}) {
  const { coupling, duplication, deadCode, overallScore, snapshotId, topN } = opts;

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

  if (duplication) {
    console.log('');
    if (duplication.duplicateBlocks.length > 0) {
      console.log(chalk.bold('Duplicate blocks:'));
      duplication.duplicateBlocks
        .sort((a, b) => b.lines - a.lines).slice(0, topN)
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

  if (deadCode) {
    console.log('');
    if (deadCode.items.length > 0) {
      console.log(chalk.bold('Dead code issues:'));
      deadCode.items.filter(i => i.type === 'unused-file').slice(0, topN)
        .forEach(i => console.log(`    ${chalk.red('✗')} ${i.filePath}`));
      deadCode.items.filter(i => i.type === 'unused-export').slice(0, topN)
        .forEach(i => console.log(`    ${chalk.yellow('~')} ${i.filePath} ${chalk.dim('→')} ${i.name}`));
      deadCode.items.filter(i => i.type === 'unresolved-import').slice(0, topN)
        .forEach(i => console.log(`    ${chalk.red('?')} ${i.filePath} ${chalk.dim('→')} ${i.name}`));
    } else {
      console.log(chalk.green('  No dead code found.'));
    }
  }
  console.log('');
}

function printDiffRow(label: string, prev: number, curr: number) {
  console.log(`  ${label.padEnd(22)} ${formatScore(prev)} → ${formatScore(curr)}${formatDelta(prev, curr)}`);
}

function printCountRow(label: string, prev: number, curr: number) {
  const delta = curr - prev;
  const d = delta === 0 ? chalk.dim('  ±0') : delta > 0 ? chalk.red(`  +${delta}`) : chalk.green(`  ${delta}`);
  console.log(`  ${label.padEnd(22)} ${String(prev).padStart(6)} → ${String(curr).padStart(6)}${d}`);
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