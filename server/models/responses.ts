import type { FileStatus } from "../modules/file-handling/git.js";

// The viewer runs in one of two modes, chosen by the CLI at startup. Both push a
// patch over the same SSE `diff` event; `mode` tells the client which chrome to
// render and which routes exist.
export type DiffResponse = {
  mode: "local";
  patch: string;
  cwd: string;
  statuses: FileStatus[];
  ahead: number;
};

export type ReviewResponse = {
  mode: "review";
  patch: string;
  cwd: string;
  pullRequest: PullRequest;
};

export type ViewerResponse = DiffResponse | ReviewResponse;

// Subset of `gh pr view --json` we surface in the UI. `reviewDecision` is an
// empty string when GitHub has not recorded a decision for the PR.
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
  reviewDecision: string;
};

export type ReviewEvent = "approve" | "request-changes" | "comment";

export function serializeDiffEvent(response: ViewerResponse): string {
  return `event: diff\ndata: ${JSON.stringify(response)}\n\n`;
}
