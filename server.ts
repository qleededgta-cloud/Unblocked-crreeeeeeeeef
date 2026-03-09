import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const db = new Database("games.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // Helper to broadcast to all clients
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // API Routes
  app.get("/api/games", (req, res) => {
    const games = db.prepare("SELECT * FROM games ORDER BY created_at DESC").all();
    res.json(games);
  });

  app.post("/api/games", (req, res) => {
    const { title, url, thumbnail, description, password } = req.body;

    if (password !== "bkenn204") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!title || !url) {
      return res.status(400).json({ error: "Title and URL are required" });
    }

    try {
      const info = db.prepare(
        "INSERT INTO games (title, url, thumbnail, description) VALUES (?, ?, ?, ?)"
      ).run(title, url, thumbnail, description);
      
      const newGame = db.prepare("SELECT * FROM games WHERE id = ?").get(info.lastInsertRowid);
      
      // Broadcast update
      broadcast({ type: "GAME_ADDED", game: newGame });
      
      res.status(201).json(newGame);
    } catch (error) {
      res.status(500).json({ error: "Failed to add game" });
    }
  });

  app.delete("/api/games/:id", (req, res) => {
    const { password } = req.body;
    const { id } = req.params;

    if (password !== "bkenn204") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      db.prepare("DELETE FROM games WHERE id = ?").run(id);
      
      // Broadcast update
      broadcast({ type: "GAME_DELETED", id: Number(id) });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete game" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  // Proxy fetch for scraping
  app.get("/api/proxy-fetch", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      const html = await response.text();
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
