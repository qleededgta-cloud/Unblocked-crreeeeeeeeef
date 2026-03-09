import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_KEY?.trim();

    if (!supabaseUrl || supabaseUrl === "your_supabase_url" || supabaseUrl === "") {
      throw new Error("SUPABASE_URL is missing. Please add it to your Secrets in AI Studio.");
    }
    if (!supabaseKey || supabaseKey === "your_supabase_key" || supabaseKey === "") {
      throw new Error("SUPABASE_KEY is missing. Please add it to your Secrets in AI Studio.");
    }

    // Basic URL validation
    if (!supabaseUrl.startsWith("http://") && !supabaseUrl.startsWith("https://")) {
      throw new Error("Invalid SUPABASE_URL. It must start with http:// or https://. Check your Secrets.");
    }

    try {
      supabaseClient = createClient(supabaseUrl, supabaseKey);
    } catch (err: any) {
      throw new Error(`Failed to initialize Supabase: ${err.message}`);
    }
  }
  return supabaseClient;
}

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
  app.get("/api/games", async (req, res) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/games", async (req, res) => {
    const { title, url, thumbnail, description, password } = req.body;

    if (password !== "bkenn204") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!title || !url) {
      return res.status(400).json({ error: "Title and URL are required" });
    }

    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("games")
        .insert([{ title, url, thumbnail, description }])
        .select()
        .single();

      if (error) throw error;

      // Broadcast update
      broadcast({ type: "GAME_ADDED", game: data });
      
      res.status(201).json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/games/:id", async (req, res) => {
    const { password } = req.body;
    const { id } = req.params;

    if (password !== "bkenn204") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("games")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Broadcast update
      broadcast({ type: "GAME_DELETED", id: Number(id) });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

  // Proxy fetch for scraping (Netlify compatibility)
  app.get("/.netlify/functions/scrape", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const fetchRes = await fetch(url);
      if (!fetchRes.ok) {
        throw new Error(`Failed to fetch: ${fetchRes.statusText}`);
      }
      const html = await fetchRes.text();

      // Use Gemini to extract metadata (same as Netlify function)
      const apiKey = process.env.GEMINI_API_KEY || "";
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured.");
      }

      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract the game title, a short description, and a thumbnail image URL from this HTML content of a game page. Return only JSON.
        
        HTML Content (truncated):
        ${html.substring(0, 15000)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              thumbnail: { type: Type.STRING },
            },
            required: ["title", "description", "thumbnail"],
          },
        },
      });

      const result = JSON.parse(response.text || '{}');
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
