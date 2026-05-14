import path from 'node:path';
import { discoverFiles, relativePath } from '../utils/files.js';
import { extractImports } from '../utils/imports.js';
import type { CouplingResult, ModuleNode } from '../types.js';

export async function analyzeCoupling(rootPath: string): Promise<CouplingResult> {
  const files = await discoverFiles(rootPath);

  // Build import graph: file -> files it imports
  const importMap = new Map<string, Set<string>>();
  for (const file of files) {
    const imports = extractImports(file);
    // Only track imports that are within the discovered files
    const internal = imports.filter(i => files.includes(i));
    importMap.set(file, new Set(internal));
  }

  // Compute fan-in for each file (how many other files import it)
  const fanInMap = new Map<string, number>();
  for (const file of files) fanInMap.set(file, 0);
  for (const [, imports] of importMap) {
    for (const imp of imports) {
      fanInMap.set(imp, (fanInMap.get(imp) ?? 0) + 1);
    }
  }

  // Build module nodes
  const modules: ModuleNode[] = files.map(file => {
    const fanOut = importMap.get(file)?.size ?? 0;
    const fanIn = fanInMap.get(file) ?? 0;
    const total = fanIn + fanOut;
    const instability = total === 0 ? 0 : fanOut / total;

    return {
      filePath: relativePath(file, rootPath),
      imports: [...(importMap.get(file) ?? [])].map(f => relativePath(f, rootPath)),
      fanOut,
      fanIn,
      instability,
    };
  });

  // Coupling entropy score: weighted average instability (0=stable, 100=chaotic)
  const score = modules.length === 0
    ? 0
    : Math.round((modules.reduce((sum, m) => sum + m.instability, 0) / modules.length) * 100);

  // Flag files with high coupling (fan-out > 10 or instability > 0.8)
  const highCouplingFiles = modules
    .filter(m => m.fanOut > 10 || m.instability > 0.8)
    .map(m => m.filePath);

  return {
    score,
    modules,
    totalFiles: files.length,
    highCouplingFiles,
  };
}