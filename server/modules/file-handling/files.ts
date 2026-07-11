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


function runGit(args: string[], cwd: string): string {
  try {
    return execSync(['git', ...args].join(' '), {
      cwd,
      maxBuffer: 100 * 1024 * 1024,
    }).toString();
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    // git diff / git diff --no-index exit non-zero when differences exist — expected
    if (e.stdout) return e.stdout.toString();
    return '';
  }
}

function listUntrackedFiles(cwd: string): string[] {
  return runGit(['ls-files', '--others', '--exclude-standard'], cwd)
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

// Produce a synthetic "new file" patch for an untracked file so it renders as a
// full-file addition in the diff viewer.
function patchForUntrackedFile(cwd: string, file: string): string {
  // git diff --no-index exits 1 when the paths differ, which is expected.
  return runGit(['diff', '--no-index', '/dev/null', file], cwd);
}

export function runGitDiff(cwd: string): string {
  // Tracked changes vs HEAD: covers modifications and deletions (staged + unstaged).
  const tracked = runGit(['diff', 'HEAD'], cwd);

  // Untracked (brand-new) files are invisible to `git diff`. Synthesize a
  // new-file patch for each so they appear in the viewer.
  const untracked = listUntrackedFiles(cwd)
    .map((file) => patchForUntrackedFile(cwd, file))
    .filter(Boolean);

  return [tracked, ...untracked].join('\n');
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
