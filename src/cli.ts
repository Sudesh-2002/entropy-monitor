import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { analyzeCoupling } from './analyzers/coupling.js';
import { analyzeDuplication } from './analyzers/duplication.js';
import { analyzeDeadCode } from './analyzers/deadcode.js';

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
  .option('--skip-duplication', 'skip duplication analysis (faster)')
  .option('--skip-deadcode', 'skip dead code analysis (faster)')
  .action(async (targetPath: string, opts: {
    top: string;
    skipDuplication: boolean;
    skipDeadcode: boolean;
  }) => {
    const root = path.resolve(targetPath);
    const topN = parseInt(opts.top, 10);

    // --- Coupling ---
    const s1 = ora('Analyzing coupling…').start();
    const coupling = await analyzeCoupling(root);
    s1.succeed('Coupling analysis done');

    // --- Duplication ---
    let duplication;
    if (!opts.skipDuplication) {
      const s2 = ora('Analyzing duplication…').start();
      duplication = await analyzeDuplication(root);
      s2.succeed('Duplication analysis done');
    }

    // --- Dead code ---
    let deadCode;
    if (!opts.skipDeadcode) {
      const s3 = ora('Analyzing dead code…').start();
      deadCode = await analyzeDeadCode(root);
      s3.succeed('Dead code analysis done');
    }

    // --- Overall score ---
    const scores = [coupling.score];
    if (duplication) scores.push(duplication.score);
    if (deadCode) scores.push(deadCode.score);
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // --- Header ---
    console.log('');
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log(chalk.bold('  Entropy Monitor Report'));
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log('');
    console.log(`  Overall entropy:   ${scoreColor(overallScore)(overallScore + '/100')}  ${scoreBar(overallScore)}`);
    console.log(`  Coupling score:    ${scoreColor(coupling.score)(String(coupling.score).padStart(3) + '/100')}`);
    if (duplication) {
      console.log(`  Duplication score: ${scoreColor(duplication.score)(String(duplication.score).padStart(3) + '/100')}  (${duplication.percentage}% duplicate lines)`);
    }
    if (deadCode) {
      console.log(`  Dead code score:   ${scoreColor(deadCode.score)(String(deadCode.score).padStart(3) + '/100')}  (${deadCode.items.length} issues)`);
    }
    console.log('');
    console.log(chalk.dim(`  Files scanned:      ${coupling.totalFiles}`));
    if (duplication) console.log(chalk.dim(`  Total lines:        ${duplication.totalLines}`));
    if (deadCode) {
      console.log(chalk.dim(`  Unused exports:     ${deadCode.unusedExports}`));
      console.log(chalk.dim(`  Unused files:       ${deadCode.unusedFiles}`));
      console.log(chalk.dim(`  Unresolved imports: ${deadCode.unresolvedImports}`));
    }
    console.log('');

    // --- Coupling table ---
    console.log(chalk.bold('Most coupled files:'));
    const sorted = [...coupling.modules]
      .sort((a, b) => b.fanOut - a.fanOut)
      .slice(0, topN);

    for (const m of sorted) {
      if (m.fanOut === 0 && m.fanIn === 0) continue;
      console.log(
        `  ${chalk.cyan(m.filePath.padEnd(48))}` +
        `  out:${String(m.fanOut).padStart(3)}` +
        `  in:${String(m.fanIn).padStart(3)}` +
        `  ${instabilityBar(m.instability)} ${m.instability.toFixed(2)}`
      );
    }

    // --- Duplication table ---
    if (duplication) {
      console.log('');
      if (duplication.duplicateBlocks.length > 0) {
        console.log(chalk.bold('Duplicate blocks:'));
        duplication.duplicateBlocks
          .sort((a, b) => b.lines - a.lines)
          .slice(0, topN)
          .forEach(d => {
            console.log(
              `  ${chalk.yellow(d.file1)}:${d.startLine1}` +
              chalk.dim(' ↔ ') +
              `${chalk.yellow(d.file2)}:${d.startLine2}` +
              chalk.dim(` (${d.lines} lines)`)
            );
          });
      } else {
        console.log(chalk.green('  No duplicate blocks found.'));
      }
    }

    // --- Dead code table ---
    if (deadCode) {
      console.log('');
      if (deadCode.items.length > 0) {
        console.log(chalk.bold('Dead code issues:'));

        const unusedFiles = deadCode.items.filter(i => i.type === 'unused-file').slice(0, topN);
        const unusedExports = deadCode.items.filter(i => i.type === 'unused-export').slice(0, topN);
        const unresolved = deadCode.items.filter(i => i.type === 'unresolved-import').slice(0, topN);

        if (unusedFiles.length > 0) {
          console.log(chalk.dim('  Unused files:'));
          unusedFiles.forEach(i => console.log(`    ${chalk.red('✗')} ${i.filePath}`));
        }
        if (unusedExports.length > 0) {
          console.log(chalk.dim('  Unused exports:'));
          unusedExports.forEach(i =>
            console.log(`    ${chalk.yellow('~')} ${i.filePath} ${chalk.dim('→')} ${i.name}`)
          );
        }
        if (unresolved.length > 0) {
          console.log(chalk.dim('  Unresolved imports:'));
          unresolved.forEach(i =>
            console.log(`    ${chalk.red('?')} ${i.filePath} ${chalk.dim('→')} ${i.name}`)
          );
        }
      } else {
        console.log(chalk.green('  No dead code found.'));
      }
    }

    console.log('');
  });

program.parse();

function scoreColor(score: number) {
  if (score < 30) return chalk.green;
  if (score < 60) return chalk.yellow;
  return chalk.red;
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10);
  const color = score < 30 ? chalk.green : score < 60 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(10 - filled));
}

function instabilityBar(value: number): string {
  const filled = Math.round(value * 10);
  return chalk.red('█'.repeat(filled)) + chalk.dim('░'.repeat(10 - filled));
}