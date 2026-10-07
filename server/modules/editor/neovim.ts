import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Neovim names its default socket `nvim.<pid>.0`, which lets us skip sockets left
// behind by instances that have since exited.
const SOCKET_FILE = /^nvim\.(\d+)\.0$/;

// Opens files in an already-running Neovim over its RPC socket, so the diff
// viewer jumps you to a line in the editor you already have open rather than
// spawning a new one.
export class Neovim {
  constructor(
    private readonly cwd: string,
    private readonly configuredServer: string | undefined,
  ) { }

  open(file: string, line: number): void {
    const target = this.resolveFile(file);
    const server = this.resolveServer();

    // Send a Vim expression rather than keystrokes: `--remote-send` would parse
    // `<...>` inside a path as key codes, while `fnameescape` quotes the path
    // correctly for the `:edit` command line at runtime. Only the surrounding
    // single-quoted Vim string needs escaping here, by doubling the quotes.
    const literal = target.replace(/'/g, "''");

    // Move the cursor in a scheduled callback instead of with `:edit +N`.
    // Plugins that restore the last cursor position on BufReadPost from a
    // scheduled callback would otherwise run after `+N` and move it back.
    const jump =
      `lua vim.schedule(function() ` +
      `local row = math.min(${line}, vim.api.nvim_buf_line_count(0)); ` +
      `pcall(vim.api.nvim_win_set_cursor, 0, {row, 0}); ` +
      `vim.cmd("normal! zz") end)`;
    const expr = `execute(['edit ' .. fnameescape('${literal}'), '${jump}'])`;

    try {
      execFileSync("nvim", ["--server", server, "--remote-expr", expr], {
        cwd: this.cwd,
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (err: unknown) {
      const e = err as { code?: string; stderr?: Buffer };

      if (e.code === "ENOENT") {
        throw new Error("nvim was not found on PATH.");
      }

      throw new Error(e.stderr?.toString().trim() || `Neovim refused to open ${file}.`);
    }
  }

  // Keep the viewer from reaching outside the repository it was started on.
  private resolveFile(file: string): string {
    const root = path.resolve(this.cwd);
    const target = path.resolve(root, file);

    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Refusing to open a path outside the repository: ${file}`);
    }

    // `:edit` on a missing path would silently create an empty buffer, which
    // looks like success but isn't what was asked for.
    if (!existsSync(target)) {
      throw new Error(`${file} no longer exists on disk.`);
    }

    return target;
  }

  // An explicit address wins, then `$NVIM` (which Neovim sets for jobs it starts,
  // so launching the viewer from `:terminal` targets that instance). Otherwise
  // prefer a Neovim already working in this repository, since an unrelated
  // session is rarely where you want the file to land, and fall back to the most
  // recently started one.
  private resolveServer(): string {
    const explicit = this.configuredServer ?? process.env.NVIM ?? process.env.NVIM_LISTEN_ADDRESS;
    if (explicit) {
      return explicit;
    }

    const sockets = this.discoverSockets();
    const inRepo = sockets.find((socket) => this.isWorkingInRepo(socket));
    if (inRepo ?? sockets[0]) {
      return (inRepo ?? sockets[0]) as string;
    }

    throw new Error(
      "No running Neovim found. Start one with `nvim --listen /tmp/nvim.sock`, " +
      "run diff-viewer with `--nvim-server <address>`, or launch it from Neovim's :terminal.",
    );
  }

  private isWorkingInRepo(socket: string): boolean {
    const root = path.resolve(this.cwd);

    try {
      const out = execFileSync("nvim", ["--server", socket, "--remote-expr", "getcwd()"], {
        timeout: 1000,
        stdio: ["ignore", "pipe", "ignore"],
      }).toString().trim();

      const editorCwd = path.resolve(out);
      return editorCwd === root || editorCwd.startsWith(root + path.sep);
    } catch {
      // Unreachable or wedged instance; treat it as not a match.
      return false;
    }
  }

  // Sockets live directly in $XDG_RUNTIME_DIR, or one directory deep under
  // <tmpdir>/nvim.<user>/ which is where Neovim puts them without XDG set.
  private discoverSockets(): string[] {
    const roots = [
      process.env.XDG_RUNTIME_DIR,
      path.join(os.tmpdir(), `nvim.${os.userInfo().username}`),
    ].filter((dir): dir is string => Boolean(dir));

    const found: { socket: string; mtimeMs: number }[] = [];

    for (const root of roots) {
      for (const dir of [root, ...this.subdirectories(root)]) {
        for (const entry of this.readDir(dir)) {
          const pid = SOCKET_FILE.exec(entry)?.[1];
          if (!pid || !this.isRunning(Number(pid))) {
            continue;
          }

          const socket = path.join(dir, entry);
          try {
            found.push({ socket, mtimeMs: statSync(socket).mtimeMs });
          } catch {
            // Raced with the instance shutting down.
          }
        }
      }
    }

    return found.sort((a, b) => b.mtimeMs - a.mtimeMs).map((f) => f.socket);
  }

  private subdirectories(dir: string): string[] {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(dir, entry.name));
    } catch {
      return [];
    }
  }

  private readDir(dir: string): string[] {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  }

  private isRunning(pid: number): boolean {
    try {
      // Signal 0 checks for existence without touching the process.
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
