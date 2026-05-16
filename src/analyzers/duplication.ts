import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectLanguage } from '../utils/language.js';
import type { DuplicateBlock, DuplicationResult } from '../types.js';

export async function analyzeDuplication(rootPath: string): Promise<DuplicationResult> {
  const detected = await detectLanguage(rootPath);
  const languages = detected.map(d => d.duplicationLanguage).join(',');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entropy-'));
  const jscpdReport = path.join(tmpDir, 'jscpd-report.json');

  try {
    execSync(
      `npx jscpd "${rootPath}" --reporters json --output "${tmpDir}" --min-lines 5 --min-tokens 50 --languages "${languages}" --ignore "**/node_modules/**,**/dist/**,**/build/**,**/venv/**,**/.venv/**,**/site-packages/**,**/vendor/**,**/__pycache__/**,**/.git/**,**/target/**" --silent`,
      { stdio: 'pipe' }
    );
  } catch {
    // jscpd exits 1 when duplicates found — expected
  }

  if (!fs.existsSync(jscpdReport)) return emptyResult();

  let raw: JscpdReport;
  try {
    raw = JSON.parse(fs.readFileSync(jscpdReport, 'utf-8'));
  } catch {
    return emptyResult();
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const duplicateBlocks: DuplicateBlock[] = (raw.duplicates ?? []).map(clone => ({
    file1: path.relative(rootPath, clone.firstFile.name),
    file2: path.relative(rootPath, clone.secondFile.name),
    startLine1: clone.firstFile.start,
    startLine2: clone.secondFile.start,
    lines: clone.lines,
  }));

  const totalLines     = raw.statistics?.total?.lines ?? 0;
  const duplicateLines = raw.statistics?.total?.duplicatedLines ?? 0;
  const percentage     = totalLines > 0
    ? Math.round((duplicateLines / totalLines) * 100 * 10) / 10
    : 0;
  const score = Math.min(100, Math.round((percentage / 20) * 100));

  return { score, duplicateBlocks, totalLines, duplicateLines, percentage };
}

function emptyResult(): DuplicationResult {
  return { score: 0, duplicateBlocks: [], totalLines: 0, duplicateLines: 0, percentage: 0 };
}

interface JscpdReport {
  duplicates: Array<{
    firstFile:  { name: string; start: number; end: number };
    secondFile: { name: string; start: number; end: number };
    lines: number;
  }>;
  statistics: { total: { lines: number; duplicatedLines: number } };
}