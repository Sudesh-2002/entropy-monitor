import { Command } from 'commander';

const program = new Command();

program
  .name('entropy-monitor')
  .description('Tracks codebase disorder over time')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan a codebase and record an entropy snapshot')
  .argument('[path]', 'root of the codebase to scan', '.')
  .action((targetPath: string) => {
    console.log(`Scanning: ${targetPath}`);
    console.log('Hello from Entropy Monitor — setup complete!');
  });

program.parse();