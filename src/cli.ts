import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { analyzeCoupling } from './analyzers/coupling.js';
import path from 'node:path';

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
  .action(async (targetPath: string, opts: { top: string }) => {
    const root = path.resolve(targetPath);
    const topN = parseInt(opts.top, 10);

    const spinner = ora('Analyzing coupling…').start();
    const coupling = await analyzeCoupling(root);
    spinner.succeed('Coupling analysis done');

    console.log('');
    console.log(chalk.bold('Coupling entropy score:'), scoreColor(coupling.score)(`${coupling.score}/100`));
    console.log(chalk.dim(`Files scanned: ${coupling.totalFiles}`));
    console.log('');

    if (coupling.modules.length === 0) {
      console.log(chalk.yellow('No TypeScript files found.'));
      return;
    }

    console.log(chalk.bold('Most coupled files (by fan-out):'));
    const sorted = [...coupling.modules]
      .sort((a, b) => b.fanOut - a.fanOut)
      .slice(0, topN);

    for (const m of sorted) {
      const instBar = instabilityBar(m.instability);
      console.log(
        `  ${chalk.cyan(m.filePath.padEnd(50))}` +
        `  fan-out: ${String(m.fanOut).padStart(3)}` +
        `  fan-in: ${String(m.fanIn).padStart(3)}` +
        `  instability: ${instBar} ${m.instability.toFixed(2)}`
      );
    }
  });

program.parse();

function scoreColor(score: number) {
  if (score < 30) return chalk.green;
  if (score < 60) return chalk.yellow;
  return chalk.red;
}

function instabilityBar(value: number): string {
  const filled = Math.round(value * 10);
  return chalk.red('█'.repeat(filled)) + chalk.dim('░'.repeat(10 - filled));
}