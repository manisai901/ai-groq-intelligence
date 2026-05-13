import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Route for Groq with Streaming
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;

      // Transform history to Groq format
      const messages = history.map((h: any) => ({
        role: h.role === "model" ? "assistant" : "user",
        content: h.parts?.[0]?.text || "",
      }));

      messages.push({ role: "user", content: message });

      // Set headers for SSE (Server-Sent Events)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are Mani AI, a high-performance intelligence assistant. Provide precise, grounded, and helpful responses."
          },
          ...messages
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 1,
        stream: true, // Enable streaming
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error("Groq API Error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to generate response" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
        res.end();
      }
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
