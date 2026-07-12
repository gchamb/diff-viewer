export type FileStatus = {
  path: string;
  index: string;
  worktree: string;
}

export type DiffPayload = {
  patch: string;
  cwd: string;
  statuses: FileStatus[];
}

// Derived, UI-facing state for a single file.
export type FileUIState = {
  // Whether the file has staged changes (X non-space and not `?`).
  staged: boolean;
  // Whether the file has unstaged/untracked changes that `git add` would stage.
  canStage: boolean;
  // Whether there are staged changes to unstage.
  canUnstage: boolean;
  // True when the file does not exist in HEAD, so restoring it deletes it.
  destructiveRestore: boolean;
  // Short label describing the change.
  label: string;
  // Badge kind for styling.
  kind: 'new' | 'deleted' | 'modified';
}
