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

export interface EntropySnapshot {
  timestamp: number;
  coupling: CouplingResult;
}