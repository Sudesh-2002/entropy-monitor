import { execSync } from 'node:child_process';
import path from 'node:path';
import type { DeadCodeItem, DeadCodeResult } from '../types.js';

export async function analyzeDeadCode(rootPath: string): Promise<DeadCodeResult> {
  let output = '';

  try {
    output = execSync(
      `npx knip --reporter json`,
      {
        cwd: rootPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      }
    );
  } catch (err: unknown) {
    // knip exits with non-zero when issues found — capture stdout anyway
    if (isExecError(err) && err.stdout) {
      output = err.stdout;
    }
  }

  if (!output.trim()) {
    return emptyResult();
  }

  let report: KnipReport;
  try {
    report = JSON.parse(output);
  } catch {
    return emptyResult();
  }

  const items: DeadCodeItem[] = [];

  for (const file of report.files ?? []) {
    items.push({
      filePath: path.relative(rootPath, file),
      type: 'unused-file',
    });
  }

  for (const [filePath, exports] of Object.entries(report.exports ?? {})) {
    for (const exp of exports) {
      items.push({
        filePath: path.relative(rootPath, filePath),
        type: 'unused-export',
        name: exp.name,
      });
    }
  }

  for (const [filePath, imports] of Object.entries(report.unlisted ?? {})) {
    for (const imp of imports) {
      items.push({
        filePath: path.relative(rootPath, filePath),
        type: 'unresolved-import',
        name: imp.name,
      });
    }
  }

  const unusedExports = items.filter(i => i.type === 'unused-export').length;
  const unusedFiles = items.filter(i => i.type === 'unused-file').length;
  const unresolvedImports = items.filter(i => i.type === 'unresolved-import').length;

  // Score: weighted sum, capped at 100
  // unused files hurt most, then exports, then unresolved imports
  const rawScore = (unusedFiles * 10) + (unusedExports * 3) + (unresolvedImports * 2);
  const score = Math.min(100, rawScore);

  return { score, items, unusedExports, unusedFiles, unresolvedImports };
}

function emptyResult(): DeadCodeResult {
  return {
    score: 0,
    items: [],
    unusedExports: 0,
    unusedFiles: 0,
    unresolvedImports: 0,
  };
}

function isExecError(err: unknown): err is { stdout: string; stderr: string } {
  return typeof err === 'object' && err !== null && 'stdout' in err;
}

// Knip JSON report shape (partial)
interface KnipReport {
  files?: string[];
  exports?: Record<string, Array<{ name: string; line: number }>>;
  unlisted?: Record<string, Array<{ name: string }>>;
}