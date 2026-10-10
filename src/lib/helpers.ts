import { FileStatus, FileUIState } from "./models/git";
import { FileDiffMetadata, CodeViewItem, ChangeTypes } from "@pierre/diffs"

export const toError = (e: unknown) => (e instanceof Error ? e.message : String(e));


export function buildItems(files: FileDiffMetadata[], version: number): CodeViewItem[] {
  return files.map((fileDiff) => ({
    id: `diff:${fileDiff.name}`,
    type: 'diff' as const,
    fileDiff,
    version,
  }));
}

export function computeStats(files: FileDiffMetadata[]) {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    for (const hunk of f.hunks) {
      additions += hunk.additionCount;
      deletions += hunk.deletionCount;
    }
  }
  return { additions, deletions };
}

// `buildItems` keys every diff item as `diff:<path>`, so a selection's item id
// carries the file it belongs to.
export function pathFromItemId(id: string): string | null {
  return id.startsWith('diff:') ? id.slice('diff:'.length) : null;
}

// Where to land when opening a whole file: the top of its first hunk, which
// sits a few context lines above the first change.
export function firstChangedLine(file: FileDiffMetadata): number {
  return Math.max(file.hunks[0]?.additionStart ?? 1, 1);
}

// Translate a selected diff line into a line in the file as it exists on disk.
// Addition-side line numbers already match. Deletion-side lines don't exist in
// the new version, so aim at the equivalent offset into the hunk's addition
// range, which lands on the right hunk even when the offset isn't exact.
export function diskLineForSelection(
  file: FileDiffMetadata | undefined,
  line: number,
  side: 'additions' | 'deletions' | undefined,
): number {
  if (side !== 'deletions' || !file) {
    return line;
  }

  const hunk = file.hunks.find(
    (h) => line >= h.deletionStart && line < h.deletionStart + h.deletionCount,
  );
  if (!hunk) {
    return 1;
  }

  const offset = line - hunk.deletionStart;
  return Math.min(hunk.additionStart + offset, hunk.additionStart + Math.max(hunk.additionCount - 1, 0));
}

export function fileStats(file: FileDiffMetadata | undefined) {
  if (!file) {
    return { additions: 0, deletions: 0 }
  }

  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    additions += hunk.additionCount;
    deletions += hunk.deletionCount;
  }
  return { additions, deletions };
}

// Badge for a file in a pull request diff. Unlike local changes there is no index
// or worktree state, so the patch's change type is all we have.
export function describeChangeType(changeType: ChangeTypes): { kind: FileUIState['kind']; label: string } {
  switch (changeType) {
    case 'new':
      return { kind: 'new', label: 'New' };
    case 'deleted':
      return { kind: 'deleted', label: 'Deleted' };
    case 'rename-pure':
    case 'rename-changed':
      return { kind: 'modified', label: 'Renamed' };
    default:
      return { kind: 'modified', label: 'Modified' };
  }
}

export function deriveFileUIState(status: FileStatus | undefined, changeType: string): FileUIState {
  const x = status?.index ?? ' ';
  const y = status?.worktree ?? ' ';

  const untracked = x === '?' && y === '?';
  const stagedNew = x === 'A';
  const notInHead = untracked || stagedNew;

  const staged = x !== ' ' && x !== '?';
  const canStage = y !== ' ' && y !== '?' ? true : untracked;
  const canUnstage = staged;

  let kind: FileUIState['kind'] = 'modified';
  if (changeType === 'new' || untracked || stagedNew) kind = 'new';
  else if (changeType === 'deleted' || x === 'D' || y === 'D') kind = 'deleted';

  const label = kind === 'new' ? 'New' : kind === 'deleted' ? 'Deleted' : 'Modified';

  return {
    staged,
    canStage,
    canUnstage,
    destructiveRestore: notInHead,
    label,
    kind,
  };
}
