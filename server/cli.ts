#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiffViewerServer } from './modules/http/server.js';
import {
  resolveRepoRoot,
  startWatcher,
} from './modules/file-handling/files.js';
import { Git } from './modules/file-handling/git.js';
import { GitHub } from './modules/file-handling/github.js';
import { Neovim } from './modules/editor/neovim.js';
import { SignalConstants } from 'node:os';
import { validateGitCommitRequest, validateGitRequest } from "./modules/http/validators/git.js"
import { validateReviewRequest } from "./modules/http/validators/github.js"
import { validateOpenRequest } from "./modules/http/validators/editor.js"

const registerSignalHandlers = (signal: keyof SignalConstants, handler: () => void) => process.on(signal, handler)

type Mode = "local" | "review";

// Pull `--name value` out of the argument list so positional parsing below stays
// about paths only.
function takeFlag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) {
    return undefined;
  }

  const value = args[at + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${name} requires a value.`);
  }

  args.splice(at, 2);
  return value;
}

// Usage: `diff-viewer [path]` for local changes, `diff-viewer review [path]` for
// the pull request on the checked-out branch. Both accept
// `--nvim-server <address>` to target a specific Neovim instance.
function parseArgs(argv: string[]): { mode: Mode; cwd: string; nvimServer?: string } {
  const args = argv.slice(2);
  const nvimServer = takeFlag(args, "--nvim-server");
  const mode: Mode = args[0] === "review" ? "review" : "local";
  const pathArg = mode === "review" ? args[1] : args[0];

  // Start from the path argument or the current directory, then climb to the
  // repository root so a launch from inside a monorepo package still lines up
  // with the root-relative paths git and GitHub report.
  return { mode, cwd: resolveRepoRoot(pathArg ?? process.cwd()), nvimServer };
}

// Live view of uncommitted local changes, with staging and committing.
function startLocalMode(server: DiffViewerServer, cwd: string) {
  const git = new Git(cwd);
  const watcher = startWatcher(cwd, () => {
    server.broadcastEvent(() => git.createDiffEvent())
  })

  server
    .addEventStream("/api/watch", () => git.createDiffEvent())
    .addRoute("/api/stage", "POST", (req, res) => {
      server.mutationBroadcast(res, () => git.stageFile(validateGitRequest(req)), () => git.createDiffEvent())
    })
    .addRoute("/api/unstage", "POST", (req, res) => {
      server.mutationBroadcast(res, () => git.unstageFile(validateGitRequest(req)), () => git.createDiffEvent())
    })
    .addRoute("/api/restore", "POST", (req, res) => {
      server.mutationBroadcast(res, () => git.restoreFile(validateGitRequest(req)), () => git.createDiffEvent())
    })
    .addRoute("/api/commit", "POST", (req, res) => {
      server.mutationBroadcast(res, () => git.commitChanges(validateGitCommitRequest(req)), () => git.createDiffEvent())
    })
    .addRoute("/api/push", "POST", (req, res) => {
      server.mutationBroadcast(res, () => git.push(), () => git.createDiffEvent())
    })

  registerSignalHandlers("SIGINT", () => {
    if (watcher.closed) {
      return;
    }

    watcher.close();
    process.exit(0);
  });
}

// Read-only view of the current branch's pull request, plus review submission.
// The diff comes from GitHub rather than the worktree, so there is nothing local
// to watch; the client refetches after submitting a review.
function startReviewMode(server: DiffViewerServer, cwd: string) {
  const github = new GitHub(cwd);
  github.assertReady();

  // Resolve the PR up front so "no pull request for this branch" is a terminal
  // error instead of an empty browser tab.
  const pr = github.currentPullRequest();
  console.log(`Reviewing #${pr.number} ${pr.title}`);

  server
    .addEventStream("/api/watch", () => github.createReviewEvent())
    .addRoute("/api/review", "POST", (req, res) => {
      server.mutationBroadcast(
        res,
        () => github.submitReview(validateReviewRequest(req)),
        () => github.createReviewEvent(),
      )
    })

  registerSignalHandlers("SIGINT", () => process.exit(0));
}

function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // When running from dist-server/, static files are in ../dist/
  // When running via tsx from repo root, they're in ./dist/
  const distDir = existsSync(path.join(__dirname, '../dist'))
    ? path.join(__dirname, '../dist')
    : path.join(__dirname, 'dist');

  const { mode, cwd, nvimServer } = parseArgs(process.argv);
  const server = new DiffViewerServer();

  if (mode === "review") {
    startReviewMode(server, cwd);
  } else {
    startLocalMode(server, cwd);
  }

  // Jumping into Neovim reads files from the worktree, which exists in both
  // modes. It doesn't change the diff, so there's nothing to broadcast.
  const neovim = new Neovim(cwd, nvimServer);
  server.addRoute("/api/open", "POST", (req, res) => {
    server.mutation(res, () => {
      const { path: file, line } = validateOpenRequest(req);
      neovim.open(file, line);
    });
  });

  server.serveStatic(distDir).start();
}

try {
  main()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
