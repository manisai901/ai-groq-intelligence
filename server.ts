import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Route for Groq with Streaming
  app.post("/api/chat", async (req, res) => {
    console.log("Chat request received");
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        console.error("GROQ_API_KEY is missing from environment");
        return res.status(500).json({ error: "GROQ_API_KEY is not configured in Settings > Environment Variables." });
      }
      
      const groqClient = new Groq({ apiKey });
      const { message, history } = req.body;

      if (!message) {
        return res.status(400).json({ error: "No message provided" });
      }

      // Transform history to Groq format
      const historyMessages = (history || []).map((h: any) => {
        // Handle various history formats
        const role = (h.role === "model" || h.role === "assistant") ? "assistant" : "user";
        const content = h.parts?.[0]?.text || h.content || "";
        return { role, content };
      }).filter((m: any) => m.content.trim() !== "");

      const messages = [
        {
          role: "system" as const,
          content: "You are Mani AI, a high-performance intelligence assistant. Provide precise, grounded, and helpful responses. Format your output with markdown. Use code blocks for technical content. Keep responses concise as per the compact UI requirements."
        },
        ...historyMessages,
        { role: "user" as const, content: message }
      ];

      const systemMessage = messages[0];
      const otherMessages = messages.slice(1);
      
      // Keep only last 10 messages but preserve system prompt
      const recentMessages = otherMessages.slice(-10);
      const finalMessages = [systemMessage, ...recentMessages];

      console.log(`Sending request to Groq with ${finalMessages.length} messages`);
      console.log(`Last message: "${message}"`);
      console.log(`Model: llama-3.3-70b-versatile`);

      // Set headers for SSE (Server-Sent Events)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.flushHeaders();

      console.log("Initiating Groq stream...");
      const stream = await groqClient.chat.completions.create({
        messages: finalMessages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 1536,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
      console.log("Stream completed successfully");
    } catch (error: any) {
      console.error("Groq API Error Detail:", error);
      const errorMessage = error.message || "Failed to generate response";
      
      if (!res.headersSent) {
        res.status(500).json({ error: errorMessage });
      } else {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.end();
      }
    }
  });

  // Health check for API Key
  app.get("/api/check-config", (req, res) => {
    res.json({ 
      hasGroqKey: !!process.env.GROQ_API_KEY,
      envMode: process.env.NODE_ENV || 'development'
    });
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
