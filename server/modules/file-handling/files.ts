import chokidar from "chokidar";
import path from "path";
import ignore, { Ignore } from "ignore";
import { existsSync, readFileSync, statSync } from "fs";
import { execFileSync } from "child_process";

// The top level of the repository containing `directoryPath`. Git reports diff
// paths relative to this root no matter which subdirectory it runs from, so
// everything that turns those paths back into files must resolve against it.
export function resolveRepoRoot(directoryPath: string): string {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
    throw new Error(`${directoryPath} is not a directory.`);
  }

  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: directoryPath,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
  } catch {
    throw new Error(`${directoryPath} is not inside a git repository.`);
  }
}

export function buildIgnore(cwd: string): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath, 'utf8'));
  }
  return ig;
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
