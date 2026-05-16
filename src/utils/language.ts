import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'go'
  | 'ruby'
  | 'cpp'
  | 'unknown';

export interface LanguageProfile {
  language: Language;
  extensions: string[];
  importPattern: RegExp[];
  duplicationLanguage: string;
  fileCount: number;
}

const PROFILES: Record<Language, Omit<LanguageProfile, 'fileCount'>> = {
  typescript: {
    language: 'typescript',
    extensions: ['ts', 'tsx'],
    importPattern: [
      /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    duplicationLanguage: 'typescript',
  },
  javascript: {
    language: 'javascript',
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    importPattern: [
      /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ],
    duplicationLanguage: 'javascript',
  },
  python: {
    language: 'python',
    extensions: ['py'],
    importPattern: [
      /^import\s+([\w.]+)/gm,
      /^from\s+([\w.]+)\s+import/gm,
    ],
    duplicationLanguage: 'python',
  },
  java: {
    language: 'java',
    extensions: ['java'],
    importPattern: [
      /^import\s+([\w.]+);/gm,
    ],
    duplicationLanguage: 'java',
  },
  go: {
    language: 'go',
    extensions: ['go'],
    importPattern: [
      /import\s+"([\w./]+)"/g,
      /import\s+\w+\s+"([\w./]+)"/g,
    ],
    duplicationLanguage: 'go',
  },
  ruby: {
    language: 'ruby',
    extensions: ['rb'],
    importPattern: [
      /require\s+['"]([^'"]+)['"]/g,
      /require_relative\s+['"]([^'"]+)['"]/g,
    ],
    duplicationLanguage: 'ruby',
  },
  cpp: {
    language: 'cpp',
    extensions: ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'],
    importPattern: [
      /#include\s+["<]([\w./]+)[">]/g,
    ],
    duplicationLanguage: 'cpp',
  },
  unknown: {
    language: 'unknown',
    extensions: [],
    importPattern: [],
    duplicationLanguage: 'javascript',
  },
};

export async function detectLanguage(rootPath: string): Promise<LanguageProfile[]> {
  const counts: Partial<Record<Language, number>> = {};

  const IGNORE_VENDOR = [
    '**/node_modules/**',
    '**/venv/**',
    '**/.venv/**',
    '**/site-packages/**',
    '**/vendor/**',
    '**/dist/**',
    '**/build/**',
    '**/__pycache__/**',
    '**/.git/**',
    '**/target/**',
    '**/gems/**',
  ];

  for (const [lang, profile] of Object.entries(PROFILES)) {
    if (lang === 'unknown') continue;
    const files = await glob(
      profile.extensions.map(e => `**/*.${e}`),
      { cwd: rootPath, ignore: IGNORE_VENDOR }
    );
    if (files.length > 0) {
      counts[lang as Language] = files.length;
    }
  }

  if (Object.keys(counts).length === 0) {
    return [{ ...PROFILES.unknown, fileCount: 0 }];
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([lang, count]) => ({
      ...PROFILES[lang as Language],
      fileCount: count,
    }));
}

export function getProfile(language: Language): LanguageProfile {
  return { ...PROFILES[language], fileCount: 0 };
}