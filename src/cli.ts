import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { analyzeCoupling } from './analyzers/coupling.js';
import { analyzeDuplication } from './analyzers/duplication.js';

const program = new Command();

program
  .name('entropy-monitor')
  .description('Tracks codebase disorder over time')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan a codebase and record an entropy snapshot')
  .argument('[path]', 'root of the codebase to scan', '.')
  .option('--top <n>', 'show top N coupled files', '10')
  .option('--skip-duplication', 'skip duplication analysis (faster)')
  .action(async (targetPath: string, opts: { top: string; skipDuplication: boolean }) => {
    const root = path.resolve(targetPath);
    const topN = parseInt(opts.top, 10);

    // --- Coupling ---
    const spinner = ora('Analyzing coupling…').start();
    const coupling = await analyzeCoupling(root);
    spinner.succeed('Coupling analysis done');

    // --- Duplication ---
    let duplication;
    if (!opts.skipDuplication) {
      const spinner2 = ora('Analyzing duplication…').start();
      duplication = await analyzeDuplication(root);
      spinner2.succeed('Duplication analysis done');
    }

    // --- Overall entropy score ---
    const overallScore = duplication
      ? Math.round((coupling.score + duplication.score) / 2)
      : coupling.score;

    console.log('');
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log(chalk.bold('  Entropy Monitor Report'));
    console.log(chalk.bold('═══════════════════════════════════════'));
    console.log('');
    console.log(
      `  Overall entropy:   ${scoreColor(overallScore)(overallScore + '/100')}  ${scoreBar(overallScore)}`
    );
    console.log(
      `  Coupling score:    ${scoreColor(coupling.score)(coupling.score + '/100')}`
    );
    if (duplication) {
      console.log(
        `  Duplication score: ${scoreColor(duplication.score)(duplication.score + '/100')}  (${duplication.percentage}% duplicate lines)`
      );
    }
    console.log('');
    console.log(chalk.dim(`  Files scanned: ${coupling.totalFiles}`));
    if (duplication) {
      console.log(chalk.dim(`  Total lines:   ${duplication.totalLines}`));
      console.log(chalk.dim(`  Dup blocks:    ${duplication.duplicateBlocks.length}`));
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
    if (duplication && duplication.duplicateBlocks.length > 0) {
      console.log('');
      console.log(chalk.bold('Duplicate blocks found:'));
      const top = duplication.duplicateBlocks
        .sort((a, b) => b.lines - a.lines)
        .slice(0, topN);

      for (const d of top) {
        console.log(
          `  ${chalk.yellow(d.file1)}:${d.startLine1}` +
          chalk.dim(' ↔ ') +
          `${chalk.yellow(d.file2)}:${d.startLine2}` +
          chalk.dim(` (${d.lines} lines)`)
        );
      }
    } else if (duplication) {
      console.log('');
      console.log(chalk.green('  No duplicate blocks found.'));
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