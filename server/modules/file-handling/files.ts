import chokidar from "chokidar";
import path from "path";
import ignore, { Ignore } from "ignore";
import { existsSync, readFileSync, statSync } from "fs";
import { execSync } from "child_process";

export function isValidGitRepository(directoryPath: string): { valid: false, message: string } | { valid: true } {
  const s = statSync(directoryPath);
  if (!s.isDirectory()) {
    return { valid: false, message: `${directoryPath} is not a directory.` }
  }

  const dotGitPath = path.join(directoryPath, ".git");
  if (!existsSync(dotGitPath)) {
    return { valid: false, message: `${directoryPath} is an initialized git repository.` }
  }

  return { valid: true }
}

export function buildIgnore(cwd: string): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf8'));
  }
  return ig;
}


export function runGitDiff(cwd: string): string {
  try {
    return execSync(['git', 'diff'].join(' '), {
      cwd,
      maxBuffer: 100 * 1024 * 1024,
    }).toString();
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    // git diff exits 1 on differences — that's expected
    if (e.stdout) return e.stdout.toString();
    return '';
  }
}

export function startWatcher(cwd: string, onChange: () => void) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const ig = buildIgnore(cwd);
  const watcher = chokidar.watch(cwd, {
    ignored: (filePath: string) => {
      const rel = path.relative(cwd, filePath);
      if (!rel) return false; // don't ignore the root itself
      if (rel.startsWith('.git')) return true;
      try {
        return ig.ignores(rel);
      } catch {
        return false;
      }
    },
    ignoreInitial: true,
    persistent: true,
  });
  watcher.on('all', () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(onChange, 150);
  });

  return watcher;
}
