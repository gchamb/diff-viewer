# diff-viewer

Terminal-launched git diff viewer in the browser. Built because existing Neovim's git diffs plugins weren't doing it for me.

Run `diff-viewer` from a git repo, get a live-updating split or unified diff UI powered by [@pierre/diffs](https://www.npmjs.com/package/@pierre/diffs).

## Requirements

- Node.js 22+
- pnpm
- git

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

Opens [http://localhost:7777](http://localhost:7777), runs `git diff`, and pushes updates over SSE when files change. Ctrl+C to stop.

## Development

```bash
pnpm build        # required before dev:server (serves dist/)
pnpm dev:server   # run CLI with tsx
pnpm dev:frontend # Vite HMR (needs /api proxy to :7777 for full stack)
```

## How it works

Express on port `7777` serves the built React app and streams diffs via `GET /api/watch` (SSE `diff` events). A debounced chokidar watcher re-runs `git diff` on file changes.
