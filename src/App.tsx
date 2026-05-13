/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Send, 
  Database, 
  Globe, 
  BarChart3, 
  ArrowUpRight, 
  Sparkles,
  Layers,
  History,
  MessageSquare,
  TrendingUp,
  ExternalLink,
  ChevronRight,
  Info,
  Menu,
  X,
  Mail,
  Mic,
  MicOff,
  Users,
  Eye,
  Activity,
  Cpu,
  Network
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';

// Declare SpeechRecognition types for TS
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { uri: string; title: string }[];
  timestamp: Date;
}


export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState({ totalUsers: 0, totalVisits: 0, dailyUsers: 0 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Tracking Logic
    const trackActivity = async () => {
      const today = new Date().toISOString().split('T')[0];
      const visitorId = localStorage.getItem('visitor_id');
      const lastVisitDate = localStorage.getItem('last_visit_date');
      const isNewVisitor = !visitorId;
      const isNewDay = lastVisitDate !== today;

      let currentId = visitorId;
      if (isNewVisitor) {
        currentId = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('visitor_id', currentId!);
      }
      localStorage.setItem('last_visit_date', today);

      const globalRef = doc(db, 'stats', 'global');
      const dailyRef = doc(db, 'daily_stats', today);

      // 1. Global Tracking
      try {
        const globalSnap = await getDoc(globalRef);
        if (!globalSnap.exists()) {
          await setDoc(globalRef, { totalUsers: 1, totalVisits: 1 });
        } else {
          await updateDoc(globalRef, {
            totalVisits: increment(1),
            totalUsers: isNewVisitor ? increment(1) : increment(0)
          });
        }
      } catch (err: any) {
        if (err.code === 'permission-denied') {
          // Attempt recovery if the doc actually exists now but getDoc failed
          try {
             await updateDoc(globalRef, { totalVisits: increment(1) });
          } catch (e) {}
        }
        console.warn("Global tracking silent failure:", err.message);
      }

      // 2. Daily Tracking
      try {
        const dailySnap = await getDoc(dailyRef);
        if (!dailySnap.exists()) {
          await setDoc(dailyRef, { uniqueUsers: 1, visits: 1, date: today });
        } else {
          await updateDoc(dailyRef, {
            visits: increment(1),
            uniqueUsers: isNewDay ? increment(1) : increment(0)
          });
        }
      } catch (err: any) {
        console.warn("Daily tracking silent failure:", err.message);
      }
    };

    trackActivity();

    // Listen for stats updates
    const unsubGlobal = onSnapshot(doc(db, 'stats', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(prev => ({ ...prev, totalUsers: data.totalUsers, totalVisits: data.totalVisits }));
      }
    }, (error) => {
      console.warn("Global stats read-only until data exists:", error.message);
    });

    const todayString = new Date().toISOString().split('T')[0];
    const unsubDaily = onSnapshot(doc(db, 'daily_stats', todayString), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(prev => ({ ...prev, dailyUsers: data.uniqueUsers }));
      }
    }, (error) => {
      console.warn("Daily stats read-only until data exists:", error.message);
    });

    return () => {
      unsubGlobal();
      unsubDaily();
    };
  }, []);

  useEffect(() => {
    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => {
          const newPath = prev ? `${prev} ${transcript}` : transcript;
          return newPath;
        });
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Voice recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMessage, timestamp: new Date() }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }))
        })
      });

      if (!response.ok) throw new Error('Failed to connect');
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      let assistantText = '';
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const { text, error } = JSON.parse(data);
              if (error) throw new Error(error);
              if (text) {
                assistantText += text;
                setMessages(prev => {
                  const currentMessages = [...prev];
                  const lastIndex = currentMessages.length - 1;
                  if (currentMessages[lastIndex].role === 'assistant') {
                    currentMessages[lastIndex] = {
                      ...currentMessages[lastIndex],
                      content: assistantText
                    };
                  }
                  return currentMessages;
                });
              }
            } catch (e) {
              console.error("Error parsing stream chunk", e);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: new Date() }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full bg-[#030303] overflow-hidden font-sans text-[#F0F0F0] selection:bg-violet-500/30">
      <LogoDef />
      <div className="stardust-overlay" />
      
      {/* Mani AI Dynamic Background Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] glow-indigo animate-pulse-slow mix-blend-screen opacity-40" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] glow-violet animate-pulse-slow mix-blend-screen opacity-30" style={{ animationDelay: '3s' }} />
        <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] glow-blue animate-pulse-slow mix-blend-screen opacity-20" style={{ animationDelay: '6s' }} />
      </div>

      {/* Sidebar: Mobile Backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar: Premium Dashboard Navigation */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 w-72 sidebar-glass z-50 shrink-0 flex flex-col transition-transform duration-300 transform lg:translate-x-0 outline-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 flex items-center justify-between">
          <Logo onClick={() => setSidebarOpen(false)} />
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-white/40 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 p-6 flex flex-col gap-10 overflow-y-auto scrollbar-hide">
            <div className="space-y-1.5">
              <SidebarItem icon={<MessageSquare className="w-4 h-4" />} label="Recent Chats" active />
              <SidebarItem icon={<Sparkles className="w-4 h-4" />} label="New Session" />
            </div>
        </nav>

        <div className="p-8 space-y-3">
          <div className="p-5 glass-premium rounded-[1.8rem] border border-white/5 space-y-5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="relative z-10">
              <p className="text-[9px] uppercase tracking-[0.25em] text-indigo-400/50 font-black mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Network Intelligence
              </p>
              
              <div className="grid gap-3">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-all">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <Users className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-[9px] text-white/30 font-bold uppercase tracking-wider">Total Entities</p>
                      <p className="text-sm font-black text-white tabular-nums tracking-tight">{stats.totalUsers.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-all">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-[9px] text-white/30 font-bold uppercase tracking-wider">Active Threads</p>
                      <p className="text-sm font-black text-white tabular-nums tracking-tight">{stats.dailyUsers.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition-all">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-[9px] text-white/30 font-bold uppercase tracking-wider">Total Synapses</p>
                      <p className="text-sm font-black text-white tabular-nums tracking-tight">{stats.totalVisits.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setMessages([])}
            className="w-full p-5 glass-premium rounded-[1.8rem] relative overflow-hidden group hover:bg-white/[0.05] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors">
                <History className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-left">
                <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold mb-0.5">Session</p>
                <p className="text-[11px] font-bold text-white/60">Clear Workspace</p>
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Container: Centered Card Experience */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 p-2 sm:p-4 lg:p-8">
        <div className="flex-1 flex flex-col glass rounded-[2rem] sm:rounded-[3rem] border-white/[0.03] overflow-hidden relative shadow-2xl">
          {/* Header */}
          <header className="h-20 sm:h-24 flex items-center justify-between px-6 sm:px-10 border-b border-white/[0.03] shrink-0">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 text-white/60 hover:text-white transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="lg:hidden">
                <Logo hideVersion />
              </div>
              <div className="hidden lg:flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <div className="flex flex-col">
                  <p className="text-[10px] sm:text-xs font-bold text-white tracking-tight uppercase">Intelligence Active</p>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-10">
              <nav className="flex items-center gap-8">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-400/60">Active Engine: Groq Llama 3.3</span>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl border border-white/5 p-1 glass hover:border-indigo-500/20 transition-all cursor-pointer group">
                <div className="w-full h-full rounded-lg sm:rounded-xl bg-gradient-to-tr from-zinc-800 to-zinc-950 flex items-center justify-center overflow-hidden relative">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400 opacity-40 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          </header>

          {/* Chat Workspace */}
          <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-12 md:px-20 md:py-16 space-y-12 scrollbar-hide"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto space-y-12 sm:space-y-16 py-12">
                  <div className="text-center space-y-6 sm:space-y-8">
                    <div className="inline-flex items-center gap-3 px-4 py-1.5 sm:px-5 sm:py-2 rounded-full bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 text-[9px] sm:text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em] animate-pulse">
                      <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" /> Neural Network Active
                    </div>
                    <div className="space-y-4">
                      <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-medium tracking-tighter leading-tight text-white italic drop-shadow-2xl px-4">
                        Limitless <br /> <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-500 bg-clip-text text-transparent">Intelligence.</span>
                      </h1>
                      <p className="text-white/50 text-sm sm:text-lg max-w-lg mx-auto font-medium leading-relaxed mt-8">
                        Unleash the full potential of your data with Mani. Grounded, precise, and instantaneous.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full">
                    <SuggestionCard 
                      title="Asset Synthesis" 
                      description="Analyze high-resolution outputs for semiconductor market shifts" 
                      onClick={() => setInput("Analyze semiconductor market shifts for Q3 2024")}
                    />
                    <SuggestionCard 
                      title="Real-Time Sync" 
                      description="Fetch comparative analysis for distributed computing nodes" 
                      onClick={() => setInput("Distributed computing nodes comparative analysis")}
                    />
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto w-full space-y-12">
                  {messages.map((message, i) => (
                    <MessageBubble key={i} message={message} />
                  ))}
                </div>
              )}
              {isLoading && <LoadingBubble />}
            </div>

            {/* Input Dock: Floating Pill */}
            <div className="px-4 py-8 sm:px-6 sm:py-10 md:px-20">
              <div className="max-w-3xl mx-auto relative group">
                <div className="absolute -inset-1.5 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 rounded-[1.5rem] sm:rounded-[2.5rem] blur-2xl opacity-10 group-focus-within:opacity-30 transition-all duration-700" />
                <form 
                  onSubmit={handleSubmit} 
                  className="relative flex items-center gap-2 sm:gap-4 bg-[#050505]/80 border border-white/[0.08] rounded-[1.5rem] sm:rounded-[2rem] p-2 sm:p-3 backdrop-blur-3xl focus-within:border-indigo-500/40 transition-all shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
                >
                  <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/[0.02] flex items-center justify-center shrink-0 border border-white/[0.05] group-focus-within:text-indigo-400 transition-colors">
                    <Sparkles className="w-5 h-5 opacity-40 group-focus-within:opacity-100" />
                  </div>
                  <div className="flex-1 relative flex items-center">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask Mani anything..."
                      className="w-full bg-transparent border-none py-2 sm:py-3 px-2 sm:px-0 text-sm focus:outline-none focus:ring-0 text-white placeholder:text-white/10 font-medium"
                    />
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={cn(
                        "p-2 rounded-xl transition-all duration-300 mr-2",
                        isListening 
                          ? "bg-red-500/20 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]" 
                          : "text-white/20 hover:text-indigo-400 hover:bg-white/5"
                      )}
                      title={isListening ? "Stop listening" : "Start voice input"}
                    >
                      {isListening ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>
                  </div>
                  <button 
                    disabled={isLoading || !input.trim()}
                    type="submit" 
                    className="h-10 sm:h-12 px-4 sm:px-8 rounded-xl sm:rounded-2xl bg-white text-black hover:bg-indigo-500 hover:text-white font-bold text-[9px] sm:text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2 sm:gap-3 shadow-xl"
                  >
                    <span className="hidden xs:inline">Send</span> <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                </form>
                <div className="absolute top-full left-0 right-0 pt-4 text-center">
                  <p className="text-[8px] sm:text-[9px] font-bold text-white/10 uppercase tracking-[0.4em]">Engine: Mani-v3.5 / Precision: High</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Status Bar */}
        <footer className="h-auto sm:h-12 py-4 sm:py-0 px-6 sm:px-10 flex flex-col sm:flex-row items-center justify-between bg-transparent shrink-0 gap-4">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-8 text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/20 font-bold text-center sm:text-left">
            <span className="flex items-center gap-2 group cursor-pointer hover:text-indigo-400 transition-colors">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span> SYSTEM: OPERATIONAL
            </span>
            <span className="hidden xs:inline">LATENCY: 14MS</span>
            <a 
              href="mailto:manikantasaivootla@gmail.com" 
              title="Support: manikantasaivootla@gmail.com"
              className="flex items-center gap-2 hover:text-indigo-400 transition-colors cursor-pointer group"
            >
              <Mail className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
              <span className="text-[8px] opacity-40 group-hover:opacity-100">SUPPORT</span>
            </a>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[9px] sm:text-[10px] font-mono text-indigo-400/60 tracking-widest font-bold tabular-nums">
              {currentTime.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} | {currentTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}


function Logo({ hideVersion = false, onClick }: { hideVersion?: boolean, onClick?: () => void }) {
  return (
    <div className="flex items-center gap-4 group cursor-pointer select-none" onClick={onClick}>
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-2xl shadow-indigo-500/40 relative overflow-hidden group-hover:scale-105 transition-transform duration-500">
        <Sparkles className="w-6 h-6 text-white relative z-10 group-hover:rotate-12 transition-transform" />
        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="font-[Verdana] text-2xl font-bold tracking-tighter bg-gradient-to-r from-white via-white to-white/40 bg-clip-text text-transparent italic no-underline">
          Mani AI
        </span>
        {!hideVersion && (
          <span className="text-[9px] font-bold tracking-[0.3em] text-indigo-400 uppercase opacity-50 group-hover:opacity-100 transition-opacity">
            Enterprise
          </span>
        )}
      </div>
    </div>
  );
}

function LogoDef() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes pulse-slow {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.1); }
      }
      .animate-pulse-slow {
        animation: pulse-slow 8s ease-in-out infinite;
      }
      .glow-indigo { background: radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%); }
      .glow-violet { background: radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%); }
      .glow-blue { background: radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%); }
    `}} />
  );
}

function SidebarItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-3.5 p-3 rounded-2xl transition-all cursor-pointer group relative overflow-hidden",
      active ? "bg-indigo-500/10 text-indigo-400" : "text-white/30 hover:text-white/80 hover:bg-white/[0.03]"
    )}>
      {active && <motion.div layoutId="sidebar-active" className="absolute left-0 w-1 h-5 bg-indigo-500 rounded-full" />}
      <div className={cn("shrink-0 transition-transform group-hover:scale-110", active ? "text-indigo-400" : "opacity-50 group-hover:opacity-100")}>
        {icon}
      </div>
      <span className="hidden md:block text-sm font-semibold tracking-tight truncate">{label}</span>
    </div>
  );
}

function SuggestionCard({ title, description, onClick }: { title: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.04] text-left transition-all hover:translate-y-[-4px] group shadow-xl"
    >
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[10px] font-bold text-indigo-400 transition-colors uppercase tracking-[0.2em]">{title}</h4>
        <div className="p-2 rounded-xl bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-all">
          <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
        </div>
      </div>
      <p className="text-sm text-white/40 leading-relaxed font-medium group-hover:text-white/60 transition-colors">{description}</p>
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "max-w-[90%] lg:max-w-[75%] group",
        isUser ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "flex items-center gap-3 mb-4 px-2",
          isUser && "flex-row-reverse"
        )}>
          {!isUser && (
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          <span className="text-[9px] font-mono tracking-[0.3em] text-white/20 uppercase font-bold">
            {isUser ? 'Human Subject 01' : 'Mani-Cluster Output'}
          </span>
        </div>
        
        <div className={cn(
          "px-8 py-7 rounded-[2rem] shadow-2xl relative overflow-hidden backdrop-blur-xl",
          isUser 
            ? "bg-white/[0.04] border border-white/10 text-white/90 rounded-tr-none" 
            : "bg-white/[0.02] text-white/90 rounded-tl-none border border-white/5"
        )}>
          {!isUser && (
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none">
              <Sparkles className="w-24 h-24" />
            </div>
          )}
          <div className="prose prose-invert prose-sm max-w-none 
            prose-p:leading-[1.7] prose-p:text-white/70 prose-p:text-base prose-p:font-medium
            prose-headings:font-display prose-headings:text-indigo-400 prose-headings:font-bold prose-headings:mb-6
            prose-code:text-indigo-300 prose-code:bg-indigo-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono
            prose-strong:text-indigo-400 prose-strong:font-bold
            prose-pre:bg-white/[0.02] prose-pre:border prose-pre:border-white/5 prose-pre:rounded-2xl">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          
          {message.sources && message.sources.length > 0 && (
            <div className="mt-10 pt-8 border-t border-white/5">
              <p className="text-[9px] font-mono tracking-[0.25em] text-white/20 uppercase mb-5 font-bold flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-indigo-500/40" /> Verified Connectivity
              </p>
              <div className="flex flex-wrap gap-3">
                {message.sources.map((source, i) => (
                  <a 
                    key={i}
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/[0.02] border border-white/10 text-[10px] hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all text-white/40 hover:text-white shadow-sm group"
                  >
                    <span className="truncate max-w-[150px] font-bold uppercase tracking-wider">{source.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex justify-start">
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-1 px-1">
          <div className="w-6 h-6 rounded bg-indigo-500/10 flex items-center justify-center animate-pulse">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <span className="text-[9px] font-mono tracking-[0.3em] text-indigo-400/50 uppercase font-bold animate-pulse">Neural Thread Active...</span>
        </div>
        <div className="bg-white/[0.02] border border-white/5 px-8 py-5 rounded-[1.5rem] rounded-tl-none w-48 flex gap-2 items-center shadow-xl">
          <motion.div animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <motion.div animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <motion.div animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </div>
      </div>
    </div>
  );
}

