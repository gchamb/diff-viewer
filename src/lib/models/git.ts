export type FileStatus = {
  path: string;
  index: string;
  worktree: string;
}

// The server picks a mode at startup: `local` watches the worktree, `review`
// shows the pull request for the checked-out branch. Both arrive on the same SSE
// `diff` event, discriminated by `mode`.
export type LocalPayload = {
  mode: 'local';
  patch: string;
  cwd: string;
  statuses: FileStatus[];
  ahead: number;
}

export type ReviewPayload = {
  mode: 'review';
  patch: string;
  cwd: string;
  pullRequest: PullRequest;
}

export type DiffPayload = LocalPayload | ReviewPayload;

export type PullRequest = {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  author: string;
  headRefName: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  // Empty when GitHub has not recorded a decision yet.
  reviewDecision: string;
}

export type ReviewEvent = 'approve' | 'request-changes' | 'comment';

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
