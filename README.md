# Mani AI - Intelligence Engine

A premium, full-stack AI-powered intelligence platform built for real-time analysis and data synthesis.

## Key Features

- **Ultra-Fast Responses**: Leveraging **Groq Cloud** with streaming (SSE) for near-instant text generation.
- **Voice Intelligence**: Integrated Web Speech API for hands-free interaction.
- **Real-Time Synthesis**: Neural processing that aggregates complex queries into cohesive responses.
- **Micro-Interaction Design**: Brutalist-inspired dark interface with smooth Framer Motion animations.
- **Secure Backend**: All API keys are proxied through a Node.js/Express backend to prevent client-side exposure.

## Architecture

### Frontend (Client-Side)
- **Framework**: React 18 + Vite.
- **Styling**: Tailwind CSS with custom "glass-premium" filters.
- **Icons**: Lucide React.
- **Streaming**: React Body Reader implementation for real-time UI updates.

### Backend (Server-Side)
- **Runtime**: Node.js + Express.
- **AI Engine**: Groq SDK (`llama-3.3-70b-versatile`).
- **Build System**: Bundled with `esbuild` for production-ready single-file output.

## Deployment to Render

To connect and deploy your app to **Render.com**, follow these steps:

1. **GitHub Connection**:
   - First, use the **Export to GitHub** tool in the AI Studio Settings menu to push your code to a repository.
2. **Create a New Web Service**:
   - Go to [Render Dashboard](https://dashboard.render.com/) and click **New > Web Service**.
   - Connect the GitHub repository you just exported.
3. **Configure the Environment**:
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. **Environment Variables**:
   - Add a secret variable in Render: `GROQ_API_KEY` (Your API key from Groq Console).
5. **Port**: Render automatically handles the `PORT` variable, and your server is configured to use it.

## Sharing & Buzz

**WhatsApp Status Ideas:**
- 🧠 *Limitless intelligence. Zero latency. Experience Mani AI v3.5.*
- 🚀 *Next-gen Groq Llama 3.3 power is here. Try the new Mani Intelligence dashboard.*
- ⚡ *Mani AI: Real-time neural synthesis at your fingertips.*

## Local Development

```bash
npm install
npm run dev
```

The server will start at `http://localhost:3000`.
