import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { DuplicateBlock, DuplicationResult } from '../types.js';

export async function analyzeDuplication(rootPath: string): Promise<DuplicationResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entropy-'));
  const reportFile = path.join(tmpDir, 'report.json');

  try {
    // Run jscpd via CLI and output JSON report
    execSync(
      `npx jscpd "${rootPath}" --reporters json --output "${tmpDir}" --min-lines 5 --min-tokens 50 --ignore "**/node_modules/**,**/dist/**,**/*.d.ts" --silent`,
      { stdio: 'pipe' }
    );
  } catch {
    // jscpd exits with code 1 when duplicates are found — that's expected
  }

  // jscpd writes to <output>/jscpd-report.json
  const jscpdReport = path.join(tmpDir, 'jscpd-report.json');

  if (!fs.existsSync(jscpdReport)) {
    return emptyResult();
  }

  let raw: JscpdReport;
  try {
    raw = JSON.parse(fs.readFileSync(jscpdReport, 'utf-8'));
  } catch {
    return emptyResult();
  }

  // Clean up temp dir
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const duplicateBlocks: DuplicateBlock[] = [];

  for (const clone of raw.duplicates ?? []) {
    duplicateBlocks.push({
      file1: path.relative(rootPath, clone.firstFile.name),
      file2: path.relative(rootPath, clone.secondFile.name),
      startLine1: clone.firstFile.start,
      startLine2: clone.secondFile.start,
      lines: clone.lines,
    });
  }

  const totalLines = raw.statistics?.total?.lines ?? 0;
  const duplicateLines = raw.statistics?.total?.duplicatedLines ?? 0;
  const percentage = totalLines > 0
    ? Math.round((duplicateLines / totalLines) * 100 * 10) / 10
    : 0;

  // Duplication score: 0 = no duplication, 100 = everything duplicated
  // Scale so that 20% duplication = score of 100 (very high)
  const score = Math.min(100, Math.round((percentage / 20) * 100));

  return { score, duplicateBlocks, totalLines, duplicateLines, percentage };
}

function emptyResult(): DuplicationResult {
  return {
    score: 0,
    duplicateBlocks: [],
    totalLines: 0,
    duplicateLines: 0,
    percentage: 0,
  };
}

// jscpd JSON report shape (partial)
interface JscpdReport {
  duplicates: Array<{
    firstFile: { name: string; start: number; end: number };
    secondFile: { name: string; start: number; end: number };
    lines: number;
  }>;
  statistics: {
    total: {
      lines: number;
      duplicatedLines: number;
    };
  };
}