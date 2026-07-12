import { FileStatus, FileUIState } from "./models/git";
import { FileDiffMetadata, CodeViewItem } from "@pierre/diffs"


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
