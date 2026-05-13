# Mani AI - Intelligence Engine

A premium, full-stack AI-powered intelligence platform built for real-time analysis and data synthesis.

## How It Works

Mani AI functions as a high-performance neural assistant that interfaces with real-time data sources.
1. **User Query**: Users enter prompts via the sleek, floating command dock.
2. **Neural Processing**: The request is routed through a secure backend proxy.
3. **Search Grounding**: The system leverages the Gemini API with active Google Search grounding to fetch and verify the latest information from the web.
4. **Synthesis**: The AI aggregates findings into a cohesive, italicized response, complete with data lineage (sources) where applicable.

## Architecture

The application follows a modern full-stack "Cloud Native" architecture:

### Frontend (Client-Side)
- **Framework**: React 18 with Vite for ultra-fast development and optimized production builds.
- **Styling**: Tailwind CSS for a custom, brutalist-inspired dark interface.
- **Animations**: Framer Motion for smooth route transitions and micro-interactions.
- **Icons**: Lucide React for consistent, high-quality visual cues.
- **State Management**: React Hooks (useState, useEffect, useRef) for managing chat history and real-time status updates.

### Backend (Server-Side)
- **Node.js + Express**: A lightweight server that handles API routing and asset serving.
- **Gemini SDK**: Integration with `@google/genai` to access advanced language models.
- **Security**: Server-side proxying of API keys via environment variables (never exposed to the browser).
- **Hybrid Serving**: Supports Vite middleware for development HMR and static serving for production.

## How to Push Updated Code

To persist your changes or push them to a repository:
1. **GitHub Integration**: Use the **Export to GitHub** option in the AI Studio "Settings" menu (top right) to link and push code directly.
2. **Manual Download**: Select **Download ZIP** from the same menu to get a full copy of the current source code for local development or manual git pushing.
