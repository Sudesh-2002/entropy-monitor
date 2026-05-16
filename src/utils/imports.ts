import fs from 'node:fs';
import path from 'node:path';
import type { Language, LanguageProfile } from './language.js';

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

export function extractImports(
  filePath: string,
  profile: LanguageProfile
): string[] {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const imports = new Set<string>();
  const dir = path.dirname(filePath);
  const lang = profile.language;

  for (const re of profile.importPattern) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const spec = match[1];
      if (!spec) continue;

      if (isRelative(spec, lang)) {
        const resolved = resolveLocal(dir, spec, profile.extensions);
        if (resolved) imports.add(normalize(resolved));
      }
    }
  }

  return [...imports];
}

function isRelative(spec: string, lang: Language): boolean {
  if (lang === 'typescript' || lang === 'javascript') {
    return spec.startsWith('.');
  }
  if (lang === 'python') {
    return spec.startsWith('.');
  }
  if (lang === 'ruby') {
    return true; // require_relative is always relative
  }
  if (lang === 'cpp') {
    return spec.includes('/') && !spec.startsWith('<');
  }
  return false;
}

function resolveLocal(
  dir: string,
  spec: string,
  extensions: string[]
): string | null {
  // Strip .js extension for TS/ESM imports
  const stripped = spec.replace(/\.js$/, '');

  const candidates = [
    stripped,
    ...extensions.map(ext => `${stripped}.${ext}`),
    ...extensions.map(ext => `${stripped}/index.${ext}`),
    spec,
    ...extensions.map(ext => `${spec}.${ext}`),
  ];

  for (const candidate of candidates) {
    const full = path.resolve(dir, candidate);
    if (fs.existsSync(full)) return full;
  }

  return null;
}