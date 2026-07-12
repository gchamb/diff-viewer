import { execFileSync } from "child_process";
import {
  rmSync,
} from "fs";
import path from "path";
import { DiffResponse } from "../../models/responses.js";

// Machine-readable `git status --porcelain` codes (exactly the 2-char XY pair
// git emits, so a `record.substring(0, 2)` value matches a member directly).
enum GitMachineStatus {
  UNSTAGED_MODIFIED = " M",
  STAGED_MODIFIED = "M ",
  STAGED_UNSTAGED_MODIFIED = "MM",
  STAGED_NEW = "A ",
  UNTRACKED = "??",
  UNSTAGED_DELETED = " D",
  STAGED_DELETED = "D ",
}

// One-letter status codes from `git status --porcelain`. `index` is the staged
// status (X), `worktree` is the unstaged status (Y). ` ` means no change there.
export type FileStatus = {
  path: string;
  index: string;
  worktree: string;
}


export class Git {
  constructor(private readonly cwd: string) { }

  private run(args: string[], hasResultsFromExitCode = false): { ok: true, stdout: string } | { ok: false, stderr: string } {
    try {
      const stdout = execFileSync('git', args, {
        cwd: this.cwd,
        maxBuffer: 100 * 1024 * 1024,
      }).toString();

      return { ok: true, stdout }
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer, status: number };


      if (e.status === 1 && hasResultsFromExitCode) {
        return {
          ok: true,
          stdout: e.stdout?.toString() ?? ''
        }
      }

      return {
        ok: false,
        stderr: e.stderr?.toString() ?? '',
      };
    }
  }

  listUntrackedFiles(): string[] {
    const res = this.run(['ls-files', '--others', '--exclude-standard'])
    if (res.ok) {
      return res.stdout
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    }
    throw new Error("Unable to get the untracked files.");
  }

  // Produce a synthetic "new file" patch for an untracked file so it renders as a
  // full-file addition in the diff viewer.
  patchForUntrackedFile(file: string): string {
    // git diff --no-index exits 1 when the paths differ, which is expected.
    const res = this.run(['diff', '--no-index', '/dev/null', file], true);
    if (res.ok) {
      return res.stdout;
    }

    throw new Error("Unable to create the patch diff for untracked file.");
  }


  getDiff(): string {
    // Tracked changes vs HEAD: covers modifications and deletions (staged + unstaged).
    const diffRes = this.run(['diff', 'HEAD'], true);
    let tracked = '';

    if (diffRes.ok) {
      tracked = diffRes.stdout;
    }

    // Untracked (brand-new) files are invisible to `git diff`. Synthesize a
    // new-file patch for each so they appear in the viewer.
    const untracked = this.listUntrackedFiles()
      .map((file) => this.patchForUntrackedFile(file))
      .filter(Boolean);


    return [tracked, ...untracked].join('\n');
  }

  stageFile(file: string): void {
    // `git add` stages modifications, new files, and deletions alike.
    const res = this.run(['add', '--', file]);
    if (res.ok) {
      console.log("Successfully staged the file.")
      return
    }

    throw new Error("Unable to stage the file.");
  }

  unstageFile(file: string): void {
    // Restore the index entry from HEAD, leaving the worktree untouched.
    const res = this.run(['restore', '--staged', '--', file]);
    if (res.ok) {
      console.log("Successfully unstaged the file.");
      return;
    }

    throw new Error("Unable to stage the file.");
  }

  // Revert a file to its state in HEAD (the latest commit). For files that don't
  // exist in HEAD (new/untracked), this means removing them from disk and index.
  restoreFile(file: string) {
    if (this.existsInHead(file)) {
      const restore = this.run(['restore', '--source=HEAD', '--staged', '--worktree', '--', file]);
      if (!restore.ok) {
        throw new Error(`Failed to restore file. stderr:${restore.stderr}`);
      }
      return;
    }

    // No committed version exists: fully remove the file to "undo" its creation.
    try {
      rmSync(path.join(this.cwd, file), { recursive: true, force: true });
    } catch (err) {
      throw new Error(`Failed to delete file. error:${String(err)}`);
    }
    // If it was staged, also drop it from the index.
    const removeFromIndex = this.run(['rm', '--cached', '-f', '--ignore-unmatch', '--', file]);
    if (!removeFromIndex.ok) {
      throw new Error(`Failed to remove file from index. stderr:${removeFromIndex.stderr}`);
    }
  }

  commitChanges(message: string) {
    const r = this.run(['commit', '-m', message]);
    if (!r.ok) {
      throw new Error(`Failed to commit message. stderr: ${r.stderr}`)
    }
  }

  // Does `path` exist in HEAD? Distinguishes tracked (restorable) files from
  // new/untracked ones (which must be deleted to "revert").
  existsInHead(file: string): boolean {
    const res = this.run(['cat-file', '-e', `HEAD: ${file} `]);
    return res.ok;
  }


  // Parse `git status--porcelain = v1` into per-file staged/unstaged status codes.
  // core.quotepath=false keeps non-ASCII paths literal instead of octal-escaped.
  getFileStatuses(): FileStatus[] {
    const out = this.run(['-c', 'core.quotepath=false', 'status', '-z', '--untracked-files=all']);
    if (!out.ok) {
      return [];
    }
    const records = out.stdout.split('\0').filter(Boolean);
    const statuses: FileStatus[] = [];
    for (const record of records) {

      const code = record.substring(0, 2);
      let file = record.substring(3); // skip the 2 status chars + the 1 space

      // Renames/copies print `old -> new `; keep the destination path.
      const arrow = file.indexOf(' -> ');
      if (arrow !== -1) file = file.slice(arrow + 4);
      if (!file) continue;

      // Keep the X/Y split for the UI (stage vs unstage vs restore decisions)
      const index = code[0] ?? ' ';
      const worktree = code[1] ?? ' ';
      statuses.push({ path: file, index, worktree });
    }

    return statuses;
  }


  // Creates a SSE Diff event with needed payload 
  createDiffEvent() {
    const fullDiff = this.getDiff()
    const response: DiffResponse = {
      patch: fullDiff,
      cwd: this.cwd,
      statuses: this.getFileStatuses(),
    }

    return `event: diff\ndata: ${JSON.stringify(response)} \n\n`;
  }

}
