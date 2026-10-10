import { execFileSync } from "child_process";
import {
  PullRequest,
  ReviewEvent,
  ReviewResponse,
  serializeDiffEvent,
} from "../../models/responses.js";

// Fields requested from `gh pr view --json`, kept in sync with `PullRequest`.
// `author` arrives as an object, so it is unwrapped after parsing.
const PR_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "isDraft",
  "author",
  "headRefName",
  "baseRefName",
  "additions",
  "deletions",
  "changedFiles",
  "reviewDecision",
] as const;

const REVIEW_FLAGS: Record<ReviewEvent, string> = {
  approve: "--approve",
  "request-changes": "--request-changes",
  comment: "--comment",
};

// Wraps the `gh` CLI so review mode piggybacks on the user's existing GitHub
// auth instead of managing tokens.
export class GitHub {
  constructor(private readonly cwd: string) { }

  private run(args: string[]): { ok: true; stdout: string } | { ok: false; stderr: string } {
    try {
      const stdout = execFileSync("gh", args, {
        cwd: this.cwd,
        maxBuffer: 100 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }).toString();

      return { ok: true, stdout };
    } catch (err: unknown) {
      const e = err as { code?: string; stderr?: Buffer };

      if (e.code === "ENOENT") {
        return {
          ok: false,
          stderr: "The GitHub CLI (gh) was not found on PATH. Install it from https://cli.github.com.",
        };
      }

      return { ok: false, stderr: e.stderr?.toString().trim() ?? "" };
    }
  }

  // Verify gh is installed and authenticated before the browser opens, so setup
  // problems surface in the terminal instead of as a failed SSE payload.
  assertReady(): void {
    const version = this.run(["--version"]);
    if (!version.ok) {
      throw new Error(version.stderr);
    }

    const auth = this.run(["auth", "status"]);
    if (!auth.ok) {
      throw new Error(`Not authenticated with GitHub. Run \`gh auth login\`.\n${auth.stderr}`);
    }
  }

  // The pull request associated with the checked-out branch. `gh` exits non-zero
  // with an explanatory message when the branch has no PR, so pass it through.
  currentPullRequest(): PullRequest {
    const res = this.run(["pr", "view", "--json", PR_FIELDS.join(",")]);
    if (!res.ok) {
      throw new Error(res.stderr || "Unable to find a pull request for the current branch.");
    }

    const pr = JSON.parse(res.stdout) as Omit<PullRequest, "author"> & {
      author?: { login?: string };
    };

    return { ...pr, author: pr.author?.login ?? "unknown" };
  }

  // The PR's unified diff against its merge base, which is what GitHub shows in
  // the "Files changed" tab.
  getDiff(): string {
    const res = this.run(["pr", "diff"]);
    if (!res.ok) {
      throw new Error(res.stderr || "Unable to get the pull request diff.");
    }

    return res.stdout;
  }

  // Submit a review. GitHub rejects request-changes and comment reviews without
  // a body; the request validator enforces that before we get here.
  submitReview({ event, body }: { event: ReviewEvent; body: string }): void {
    const args = ["pr", "review", REVIEW_FLAGS[event]];
    if (body) {
      args.push("--body", body);
    }

    const res = this.run(args);
    if (!res.ok) {
      throw new Error(res.stderr || "Unable to submit the review.");
    }
  }

  createReviewEvent(): string {
    const response: ReviewResponse = {
      mode: "review",
      patch: this.getDiff(),
      cwd: this.cwd,
      pullRequest: this.currentPullRequest(),
    };

    return serializeDiffEvent(response);
  }
}
