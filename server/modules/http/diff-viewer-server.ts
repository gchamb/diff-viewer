import express, { type Express, Handler, Response } from "express";
import path from "path";
import open from "open";

export class DiffViewerServer {
  private server: Express
  readonly connections: Set<Response> = new Set();
  constructor() {
    this.server = express()
    return this;
  }

  addConnection(res: Response) {
    this.connections.add(res)
    return this;
  }

  removeConnection(res: Response) {
    this.connections.delete(res)
    return this;
  }
  addRoute(path: string, method: "GET" | "POST" | "PATCH" | "DELETE", handler: Handler) {
    switch (method) {
      case "GET":
        this.server.get(path, handler)
        return this;
      case "POST":
        this.server.post(path, handler)
        return this;
      case "PATCH":
        this.server.patch(path, handler)
        return this;
      case "DELETE":
        this.server.delete(path, handler)
        return this;
    }
  }
  serveStatic(staticDir: string) {
    // Serve built JS/CSS/assets
    this.server.use(express.static(staticDir));

    // SPA fallback — any non-API route gets index.html
    this.server.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });

    return this;
  }
  start() {
    const server = this.server.listen(7777, () => {
      console.log("Server is starting up")
      open(`http://localhost:7777`)
    });
    server.on('error', (err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
    return server;
  }
}
