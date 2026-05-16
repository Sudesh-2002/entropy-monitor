import { glob } from 'glob';
import path from 'node:path';
import type { Language } from './language.js';

const EXTENSIONS: Record<Language, string[]> = {
  typescript: ['ts', 'tsx'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  python:     ['py'],
  java:       ['java'],
  go:         ['go'],
  ruby:       ['rb'],
  cpp:        ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'],
  unknown:    [],
};

const IGNORE_ALWAYS = [
  // JS/TS
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.test.js',
  '**/*.spec.js',
  // Python
  '**/venv/**',
  '**/.venv/**',
  '**/env/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/site-packages/**',
  // Java
  '**/target/**',
  '**/gradle/**',
  '**/.gradle/**',
  // Go
  '**/vendor/**',
  // Ruby
  '**/gems/**',
  // C/C++
  '**/cmake-build-debug/**',
  '**/cmake-build-release/**',
  // General
  '**/.git/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/coverage/**',
  '**/tmp/**',
  '**/temp/**',
];

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

export async function discoverFiles(
  rootPath: string,
  languages: Language[] = ['typescript']
): Promise<string[]> {
  const extensions = [...new Set(languages.flatMap(l => EXTENSIONS[l] ?? []))];
  if (extensions.length === 0) return [];

  const patterns = extensions.map(ext => `**/*.${ext}`);
  const files: string[] = [];

  for (const pattern of patterns) {
    const found = await glob(pattern, {
      cwd: rootPath,
      ignore: IGNORE_ALWAYS,
      absolute: true,
    });
    files.push(...found.map(normalize));
  }

  return [...new Set(files)].sort();
}

export function relativePath(filePath: string, rootPath: string): string {
  return path.relative(rootPath, filePath);
}