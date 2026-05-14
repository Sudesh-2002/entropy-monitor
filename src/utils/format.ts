import chalk from 'chalk';

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatScore(score: number): string {
  const label = score.toString().padStart(3) + '/100';
  if (score < 30) return chalk.green(label);
  if (score < 60) return chalk.yellow(label);
  return chalk.red(label);
}

export function formatDelta(prev: number, curr: number): string {
  const delta = curr - prev;
  if (delta === 0) return chalk.dim('  ±0');
  if (delta > 0) return chalk.red(`  +${delta}`);
  return chalk.green(`  ${delta}`);
}

export function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const color = score < 30 ? chalk.green : score < 60 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}