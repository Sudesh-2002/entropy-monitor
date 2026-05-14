import { execSync } from 'node:child_process';

export function getGitInfo(cwd: string): { sha: string | null; branch: string | null } {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
    return { sha, branch };
  } catch {
    return { sha: null, branch: null };
  }
}