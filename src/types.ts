export interface ModuleNode {
  filePath: string;
  imports: string[];
  fanOut: number;
  fanIn: number;
  instability: number;
}

export interface CouplingResult {
  score: number;
  modules: ModuleNode[];
  totalFiles: number;
  highCouplingFiles: string[];
}

export interface DuplicateBlock {
  file1: string;
  file2: string;
  startLine1: number;
  startLine2: number;
  lines: number;
}

export interface DuplicationResult {
  score: number;
  duplicateBlocks: DuplicateBlock[];
  totalLines: number;
  duplicateLines: number;
  percentage: number;
}

export interface DeadCodeItem {
  filePath: string;
  type: 'unused-export' | 'unused-file' | 'unresolved-import';
  name?: string;
}

export interface DeadCodeResult {
  score: number;
  items: DeadCodeItem[];
  unusedExports: number;
  unusedFiles: number;
  unresolvedImports: number;
}

export interface EntropySnapshot {
  timestamp: number;
  coupling: CouplingResult;
  duplication: DuplicationResult;
  deadCode: DeadCodeResult;
}