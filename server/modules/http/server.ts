import express, { type Express, Handler, Response } from "express";
import path from "path";
import open from "open";

export class DiffViewerServer {
  private server: Express
  readonly connections: Set<Response> = new Set();
  constructor() {
    this.server = express()
    this.server.use(express.json())
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
    const server = this.server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Unable to determine the server port");
      }

      const url = `http://localhost:${address.port}`;
      console.log(`Server is starting up at ${url}`);
      open(url);
    });
    server.on('error', (err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
    return server;
  }

  broadcastEvent(eventFn: () => string) {
    const event = eventFn()
    for (const connection of this.connections) {
      connection.write(event);
    }
  }
  // Run a mutating action, broadcast the fresh event to all clients, and
  // respond with the result so the caller can surface any error.
  mutationBroadcast<T>(
    res: Response,
    fn: () => T,
    eventFn: () => string
  ) {
    try {
      const result = fn();
      this.broadcastEvent(eventFn);
      res.status(200).json({ result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
