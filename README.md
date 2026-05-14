# Mani AI SaaS v3 - Enterprise Intelligence Platform

A modern, production-ready AI SaaS platform inspired by ChatGPT, built for scalable neural synthesis and secure collaboration.

## 🚀 Key Features

- **Full-Stack SaaS Architecture**: Integrated backend with Node.js/Express and a frontend powered by React 18 + Vite.
- **Neural Streaming**: Leverage **Groq Llama 3.3** for ultra-low latency, real-time streaming responses (up to 500+ tokens/sec).
- **Secure Authentication**: Gmail-based Google Login via **Firebase Authentication** with persistent sessions and logout.
- **Persistent Chat History**: Securely store and manage user-specific conversations in **Firestore**, allowing for search and thread management.
- **Document Intelligence**: Securely upload and store PDFs, images, and documents using **Firebase Storage**.
- **Modern UI/UX**: Professional dark-themed interface with **Framer Motion** animations, mobile-first responsive design, and markdown/code highlighting.
- **Voice Synthesis**: Integrated hands-free voice input via Web Speech API.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18
- **Styling**: Tailwind CSS 4.0
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **State Management**: React Firebase Hooks + React Hooks

### Backend
- **Runtime**: Node.js + Express
- **AI Core**: Groq SDK (`llama-3.3-70b-versatile`)
- **Database/Auth**: Firebase (Firestore, Auth, Storage)
- **Engine**: Mani-v3.5 Precision Logic

## 📦 Deployment Guide

### Firebase Setup
Before deploying, ensure your Firebase environment is provisioned:
1. Initialize Firebase in the AI Studio environment.
2. The `firebase-applet-config.json` is automatically handled for you.

### Vercel / Render / Cloud Run
The application is designed for seamless deployment:

1. **Build Phase**: `npm run build`
2. **Start Phase**: `npm start` (Runs the compiled `dist/server.cjs`)
3. **Environment**: Declare `GROQ_API_KEY` in your production environment settings.

## 📱 Mobile Experience
Mani AI is fully optimized for mobile devices with a professional side-panel navigation and touch-friendly interface, ensuring productivity on the go.

## 🛡️ Security
All API communications are proxied via our secure Node.js backend. User data is strictly isolated within Firebase using enterprise-grade security rules.

---
Built with Mani AI Precision | 2026
