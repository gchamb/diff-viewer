#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiffViewerServer } from './modules/http/server.js';
import {
  isValidGitRepository,
  startWatcher,
} from './modules/file-handling/files.js';
import { Git } from './modules/file-handling/git.js';
import { SignalConstants } from 'node:os';
import { validateGitCommitRequest, validateGitRequest } from "./modules/http/validators/git.js"


const registerSignalHandlers = (signal: keyof SignalConstants, handler: () => void) => process.on(signal, handler)

function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));


  // When running from dist-server/, static files are in ../dist/
  // When running via tsx from repo root, they're in ./dist/
  const distDir = existsSync(path.join(__dirname, '../dist'))
    ? path.join(__dirname, '../dist')
    : path.join(__dirname, 'dist');


  let cwd = process.cwd();
  const args = process.argv;

  // If there are no arguments, then use current working directory
  // If there are arguments, make sure the first arg it is a valid path to a git repository
  if (args.length > 2) {
    const gitPathDirectory = args[2];
    const validGitPath = isValidGitRepository(gitPathDirectory);
    if (!validGitPath.valid) {
      throw new Error(validGitPath.message);
    } else {
      cwd = gitPathDirectory;
    }
  }

  const server = new DiffViewerServer()
  const git = new Git(cwd);

  // Start the watcher
  const watcher = startWatcher(cwd, () => {
    server.broadcastEvent(() => git.createDiffEvent())
  })

  // Start server
  server
    .serveStatic(distDir)
    .addRoute("/api/watch", "GET", (req, res) => {
      res.setHeader("Content-Type", 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders();

      req.on('close', () => {
        server.removeConnection(res)
      })

      server.addConnection(res)
      res.write(git.createDiffEvent())
    })
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
    .start()

  // Handle signal terminators
  registerSignalHandlers("SIGINT", () => {
    if (watcher.closed) {
      return;
    }

    watcher.close();
    process.exit(0);
  });
}

try {
  main()
} catch (err) {
  console.log("Error occurred while starting.", {
    err
  })
}
