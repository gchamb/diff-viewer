# diff-viewer

Terminal-launched git diff viewer in the browser. Built because existing Neovim's git diffs plugins weren't doing it for me.

Run `diff-viewer` from a git repo, get a live-updating split or unified diff UI powered by [@pierre/diffs](https://www.npmjs.com/package/@pierre/diffs).

## Requirements

- Node.js 22+
- pnpm
- git
- [GitHub CLI](https://cli.github.com) (`gh`), authenticated — only for `diff-viewer review`

## Install

```bash
pnpm install
pnpm build
pnpm link --global   # optional
```

If `pnpm link --global` complains about PATH: `pnpm setup --force && source ~/.zshrc`

## Usage

```bash
cd my-repo
diff-viewer
```

Opens on an available localhost port, runs `git diff`, and pushes updates over SSE when files change. Ctrl+C to stop.

Both commands accept an optional path to a git repository instead of using the current directory.

### Reviewing a pull request

```bash
cd my-repo
git switch my-feature-branch
diff-viewer review
```

Resolves the pull request for the checked-out branch via `gh`, then shows its diff against
the base branch along with the title, author, branches, and review decision. The **Review**
button submits an approval, a change request, or a plain comment — GitHub requires a comment
for the latter two.

Tick **Viewed** on a file (in its header or the sidebar) to collapse it and track progress.
Viewed marks are kept in the browser's local storage per pull request, not synced to GitHub.
If a later push changes a file you marked, the mark clears and the file is flagged
"Changed since viewed". Clicking a viewed file in the sidebar expands it again.

Review mode never touches your worktree, so the staging, commit, and push controls are
hidden. It exits with an error if the branch has no pull request, or if `gh` is missing or
not logged in.

### Jumping into Neovim

Click a line number in the diff to select it, then press `o` (or use the button that appears)
to open that spot in Neovim. Each file header also has a **Neovim** button that opens the file
at its first change. Works in both modes, since both read from the worktree.

This opens the file in a Neovim you already have running rather than starting a new one, so it
needs an instance listening on a socket. The address is resolved in this order:

1. `--nvim-server <address>`
2. `$NVIM`, which Neovim sets for jobs it starts — so launching `diff-viewer` from `:terminal`
   always targets that instance
3. `$NVIM_LISTEN_ADDRESS`
4. A running Neovim whose working directory is this repository
5. The most recently started Neovim

If you have several editors open and none of them are `cd`'d into the repo, step 5 is a guess —
pass `--nvim-server` to be sure. With nothing listening at all, you get an error explaining how
to start one (`nvim --listen /tmp/nvim.sock`).

Selecting a deleted line is approximate: that line no longer exists in the file, so it aims at
the matching offset in the hunk's new-file range, which lands you on the right hunk.

## Development

```bash
pnpm build        # required before dev:server (serves dist/)
pnpm dev:server   # run CLI with tsx
pnpm dev:frontend # Vite HMR (needs an /api proxy to the running server for full stack)
```

## How it works

Express on an available port serves the built React app and streams diffs via `GET /api/watch` (SSE `diff` events). A debounced chokidar watcher re-runs `git diff` on file changes.

The CLI picks one of two modes at startup and registers only that mode's routes. Each `diff`
event carries a `mode` field (`local` or `review`) so the client knows which chrome to render.
In review mode the patch comes from `gh pr diff` rather than the worktree, so there is nothing
to watch; the client refetches after a review is submitted.
