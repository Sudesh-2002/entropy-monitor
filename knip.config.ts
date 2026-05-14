import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/cli.ts'],
  project: ['src/**/*.ts'],
  ignore: ['**/*.d.ts', '**/dist/**'],
};

export default config;