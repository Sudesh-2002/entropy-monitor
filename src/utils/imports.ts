import fs from 'node:fs';
import path from 'node:path';

const IMPORT_RE = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

export function extractImports(filePath: string): string[] {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const imports = new Set<string>();
  const dir = path.dirname(filePath);

  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const spec = match[1];
      if (spec.startsWith('.')) {
        const resolved = resolveLocal(dir, spec);
        if (resolved) imports.add(normalize(resolved));
      }
    }
  }

  return [...imports];
}

function resolveLocal(dir: string, spec: string): string | null {
  // Strip .js extension — TypeScript ESM uses .js imports that map to .ts files
  const stripped = spec.replace(/\.js$/, '');

  const candidates = [
    stripped,
    `${stripped}.ts`,
    `${stripped}.tsx`,
    `${stripped}/index.ts`,
    `${stripped}/index.tsx`,
    // also try original spec in case it really is .js
    spec,
    `${spec}.ts`,
  ];

  for (const candidate of candidates) {
    const full = path.resolve(dir, candidate);
    if (fs.existsSync(full)) return full;
  }

  return null;
}