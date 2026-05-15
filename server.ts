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
        return res.status(500).json({ 
          error: "Synthesis unavailable. Please configure 'GROQ_API_KEY' in the Settings > Environment Variables menu." 
        });
      }
      
      const groqClient = new Groq({ apiKey });
      const { message, history } = req.body;

      if (!message) {
        return res.status(400).json({ error: "No message provided" });
      }

      // Transform history to Groq format
      const historyMessages = (history || []).map((h: any) => {
        const role = (h.role === "assistant" || h.role === "model") ? "assistant" : "user";
        const content = h.content || "";
        return { role, content };
      }).filter((m: any) => m.content && m.content.trim() !== "");

      const systemPrompt = "You are MANI AI. You are a helpful AI assistant. Answer directly to the user's input without robotic greetings. Provide complete, comprehensive answers and include detailed code examples whenever applicable or requested.";
      
      const finalMessages = [
        { role: "system", content: systemPrompt },
        ...historyMessages.slice(-10),
        { role: "user", content: message }
      ];

      const model = "llama-3.3-70b-versatile";
      console.log(`[SYNTHESIS] Initiating [Model: ${model}]...`);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff'
      });
      
      // Pulse to confirm connection
      res.write(`data: ${JSON.stringify({ text: " " })}\n\n`);
      if (res.flushHeaders) res.flushHeaders();

      try {
        const startTime = Date.now();
        
        const stream = await groqClient.chat.completions.create({
          messages: finalMessages as any,
          model: model,
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        }).catch(async (e) => {
          console.warn(`[GROQ] Primary failed: ${e.message}. Trying 8b.`);
          return await groqClient.chat.completions.create({
            messages: finalMessages as any,
            model: "llama-3.1-8b-instant",
            temperature: 0.7,
            stream: true,
          });
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
          }
        }
      } catch (err: any) {
        console.error("[STREAM ERROR]", err);
        res.write(`data: ${JSON.stringify({ error: `Neural Error: ${err.message}` })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error: any) {
      console.error("[NEXUS ERROR]", error);
      const errorMessage = error.message || "Failed to generate neural response";
      
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
