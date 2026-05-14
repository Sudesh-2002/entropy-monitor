import { glob } from 'glob';
import path from 'node:path';

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

export async function discoverFiles(
  rootPath: string,
  extensions = ['ts', 'tsx'],
  ignore = ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts']
): Promise<string[]> {
  const patterns = extensions.map(ext => `**/*.${ext}`);
  const files: string[] = [];

  for (const pattern of patterns) {
    const found = await glob(pattern, {
      cwd: rootPath,
      ignore,
      absolute: true,
    });
    files.push(...found.map(normalize));
  }

  return [...new Set(files)].sort();
}

export function relativePath(filePath: string, rootPath: string): string {
  return path.relative(rootPath, filePath);
}