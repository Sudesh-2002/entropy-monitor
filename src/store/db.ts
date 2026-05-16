import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import type { CouplingResult, DuplicationResult, DeadCodeResult } from '../types.js';

export interface SnapshotRow {
  id: number;
  timestamp: number;
  git_sha: string | null;
  git_branch: string | null;
  overall_score: number;
  coupling_score: number;
  duplication_score: number;
  deadcode_score: number;
  total_files: number;
  total_lines: number;
  duplicate_lines: number;
  unused_exports: number;
  unused_files: number;
  payload: string;
}

export function openDb(rootPath: string): Database.Database {
  const dir = path.join(rootPath, '.entropy-monitor');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'history.db'));
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp        INTEGER NOT NULL,
      git_sha          TEXT,
      git_branch       TEXT,
      overall_score    INTEGER NOT NULL,
      coupling_score   INTEGER NOT NULL,
      duplication_score INTEGER NOT NULL,
      deadcode_score   INTEGER NOT NULL,
      total_files      INTEGER NOT NULL DEFAULT 0,
      total_lines      INTEGER NOT NULL DEFAULT 0,
      duplicate_lines  INTEGER NOT NULL DEFAULT 0,
      unused_exports   INTEGER NOT NULL DEFAULT 0,
      unused_files     INTEGER NOT NULL DEFAULT 0,
      payload          TEXT NOT NULL
    );
  `);
}

export function saveSnapshot(
  db: Database.Database,
  opts: {
    coupling: CouplingResult;
    duplication?: DuplicationResult;
    deadCode?: DeadCodeResult;
    overallScore: number;
    gitSha?: string;
    gitBranch?: string;
  }
): number {
  const { coupling, duplication, deadCode, overallScore, gitSha, gitBranch } = opts;

  const stmt = db.prepare(`
    INSERT INTO snapshots (
      timestamp, git_sha, git_branch,
      overall_score, coupling_score, duplication_score, deadcode_score,
      total_files, total_lines, duplicate_lines,
      unused_exports, unused_files, payload
    ) VALUES (
      @timestamp, @git_sha, @git_branch,
      @overall_score, @coupling_score, @duplication_score, @deadcode_score,
      @total_files, @total_lines, @duplicate_lines,
      @unused_exports, @unused_files, @payload
    )
  `);

  const result = stmt.run({
    timestamp: Date.now(),
    git_sha: gitSha ?? null,
    git_branch: gitBranch ?? null,
    overall_score: overallScore,
    coupling_score: coupling.score,
    duplication_score: duplication?.score ?? 0,
    deadcode_score: deadCode?.score ?? 0,
    total_files: coupling.totalFiles,
    total_lines: duplication?.totalLines ?? 0,
    duplicate_lines: duplication?.duplicateLines ?? 0,
    unused_exports: deadCode?.unusedExports ?? 0,
    unused_files: deadCode?.unusedFiles ?? 0,
    payload: JSON.stringify({ coupling, duplication, deadCode }),
  });

  return result.lastInsertRowid as number;
}

export function getHistory(
  db: Database.Database,
  limit = 30
): SnapshotRow[] {
  return db
    .prepare(`SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?`)
    .all(limit) as SnapshotRow[];
}

export function getSnapshot(
  db: Database.Database,
  id: number
): SnapshotRow | undefined {
  return db
    .prepare(`SELECT * FROM snapshots WHERE id = ?`)
    .get(id) as SnapshotRow | undefined;
}

export function getLatestTwo(db: Database.Database): [SnapshotRow | undefined, SnapshotRow | undefined] {
  const rows = db
    .prepare(`SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT 2`)
    .all() as SnapshotRow[];
  return [rows[0], rows[1]];
}