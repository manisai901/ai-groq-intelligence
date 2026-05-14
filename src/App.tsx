/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Network,
  Copy,
  Check,
  FileText,
  Map,
  Plus,
  Trash2,
  LogOut,
  User as UserIcon,
  Paperclip,
  Loader2,
  ShieldCheck,
  Pencil,
  LifeBuoy
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollection } from 'react-firebase-hooks/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, googleProvider, storage, handleFirestoreError, OperationType } from './lib/firebase';

// Declare SpeechRecognition types for TS
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

// Types
interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date | Timestamp;
  fileUrl?: string;
  fileName?: string;
}

interface Conversation {
  id: string;
  title: string;
  userId: string;
  createdAt: Date | Timestamp;
  lastUpdatedAt: Date | Timestamp;
}

export default function App() {
  const [user, authLoading] = useAuthState(auth);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState({ totalUsers: 0, totalVisits: 0, dailyUsers: 0 });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [showSupportMail, setShowSupportMail] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authentication logic
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Upsert user profile
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // Stats logic (legacy but kept as requested)
  useEffect(() => {
    if (!db) return;
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

      try {
        const globalSnap = await getDoc(globalRef).catch(() => null);
        if (globalSnap && !globalSnap.exists()) {
          await setDoc(globalRef, { totalUsers: 1, totalVisits: 1 });
        } else if (globalSnap) {
          await updateDoc(globalRef, {
            totalVisits: increment(1),
            totalUsers: isNewVisitor ? increment(1) : increment(0)
          });
        }
      } catch (err) {}

      try {
        const dailySnap = await getDoc(dailyRef).catch(() => null);
        if (dailySnap && !dailySnap.exists()) {
          await setDoc(dailyRef, { uniqueUsers: 1, visits: 1, date: today });
        } else if (dailySnap) {
          await updateDoc(dailyRef, {
            visits: increment(1),
            uniqueUsers: isNewDay ? increment(1) : increment(0)
          });
        }
      } catch (err) {}
    };

    trackActivity();

    const unsubGlobal = onSnapshot(doc(db, 'stats', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(prev => ({ ...prev, totalUsers: data.totalUsers, totalVisits: data.totalVisits }));
      }
    });

    const todayString = new Date().toISOString().split('T')[0];
    const unsubDaily = onSnapshot(doc(db, 'daily_stats', todayString), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(prev => ({ ...prev, dailyUsers: data.uniqueUsers }));
      }
    });

    return () => {
      unsubGlobal();
      unsubDaily();
    };
  }, []);

  // Fetch conversations for current user
  const [conversationsSnapshot] = useCollection(
    user ? query(
      collection(db, 'conversations'),
      where('userId', '==', user.uid),
      orderBy('lastUpdatedAt', 'desc')
    ) : null
  );

  const conversations = conversationsSnapshot?.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Conversation)) || [];

  // Fetch messages when activeConversationId changes
  useEffect(() => {
    if (!activeConversationId || !user) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'conversations', activeConversationId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Message));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [activeConversationId, user]);

  const startNewConversation = useCallback(async () => {
    if (!user) return;
    try {
      const docRef = await addDoc(collection(db, 'conversations'), {
        userId: user.uid,
        title: 'New Conversation',
        createdAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp()
      });
      setActiveConversationId(docRef.id);
      setMessages([]);
      setSidebarOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'conversations');
    }
  }, [user]);

  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'conversations', id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `conversations/${id}`);
    }
  };

  const renameConversation = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateDoc(doc(db, 'conversations', id), {
        title: editTitle.trim(),
        lastUpdatedAt: serverTimestamp()
      });
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `conversations/${id}`);
    }
  };

  // Helper to handle speech
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev ? `${prev} ${transcript}` : transcript);
        setIsListening(false);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeConversationId) return;

    try {
      setIsLoading(true);
      const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      // Add special message with file
      await addDoc(collection(db, 'conversations', activeConversationId, 'messages'), {
        role: 'user',
        content: `Uploaded file: ${file.name}`,
        fileUrl: url,
        fileName: file.name,
        timestamp: serverTimestamp()
      });

      // Update conversation title if it's the first message
      if (messages.length === 0) {
        await updateDoc(doc(db, 'conversations', activeConversationId), {
          title: file.name.slice(0, 30),
          lastUpdatedAt: serverTimestamp()
        });
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Upload failed", error);
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    const userMessage = input.trim();
    setInput('');
    
    // Ensure we have a conversation
    let currentConvId = activeConversationId;
    if (!currentConvId) {
      try {
        const docRef = await addDoc(collection(db, 'conversations'), {
          userId: user.uid,
          title: userMessage.slice(0, 30),
          createdAt: serverTimestamp(),
          lastUpdatedAt: serverTimestamp()
        });
        currentConvId = docRef.id;
        setActiveConversationId(currentConvId);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'conversations');
        return;
      }
    }

    try {
      setIsLoading(true);

      // 1. Save user message to Firestore
      await addDoc(collection(db, 'conversations', currentConvId, 'messages'), {
        role: 'user',
        content: userMessage,
        timestamp: serverTimestamp()
      });

      // 2. Call backend for streaming response
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
          }))
        })
      });

      if (!response.ok) throw new Error('Failed to connect');
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      
      // Update UI optimistically for streaming
      const tempId = 'temp-' + Date.now();
      setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date(), id: tempId }]);

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
              const { text, error: streamError } = JSON.parse(data);
              if (streamError) throw new Error(streamError);
              if (text) {
                assistantText += text;
                setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: assistantText } : m));
              }
            } catch (e) {}
          }
        }
      }

      // 3. Save full assistant message to Firestore
      await addDoc(collection(db, 'conversations', currentConvId, 'messages'), {
        role: 'assistant',
        content: assistantText,
        timestamp: serverTimestamp()
      });

      // Update conversation metadata
      await updateDoc(doc(db, 'conversations', currentConvId), {
        lastUpdatedAt: serverTimestamp()
      });

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full bg-[#030303] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative flex h-screen w-full bg-[#030303] items-center justify-center p-4 overflow-hidden">
        <div className="stardust-overlay" />
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] glow-indigo animate-pulse-slow mix-blend-screen opacity-40" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] glow-violet animate-pulse-slow mix-blend-screen opacity-30" />
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 max-w-md w-full glass-premium p-10 rounded-[3rem] border border-white/10 text-center space-y-8 shadow-2xl"
        >
          <Logo />
          <div className="space-y-4">
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Welcome to Mani AI</h1>
            <p className="text-white/40 text-sm leading-relaxed">
              Log in to access your professional AI workplace, conversation history, and advanced neural processors.
            </p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full h-14 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-white/90 transition-all active:scale-95"
          >
            <Mail className="w-5 h-5" />
            Continue with Google
          </button>
          <p className="text-[10px] text-white/20 uppercase tracking-widest font-black">
            Secured by Firebase Enterprise
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full bg-[#030303] overflow-hidden font-sans text-[#F0F0F0] selection:bg-violet-500/30">
      <div className="stardust-overlay" />
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[70%] glow-indigo animate-pulse-slow mix-blend-screen opacity-10 sm:opacity-40" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] glow-violet animate-pulse-slow mix-blend-screen opacity-10 sm:opacity-30" style={{ animationDelay: '3s' }} />
      </div>

      {/* Sidebar Backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Modern Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 w-72 sidebar-glass z-50 shrink-0 flex flex-col transition-transform duration-300 transform lg:translate-x-0 outline-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 pb-4 flex items-center justify-between">
          <Logo onClick={() => setSidebarOpen(false)} />
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-white/40 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 mb-6">
          <button 
            onClick={startNewConversation}
            className="w-full p-4 glass-premium rounded-2xl border border-white/5 flex items-center gap-3 text-indigo-400 hover:bg-white/5 transition-all group"
          >
            <div className="p-2 rounded-xl bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-all">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold uppercase tracking-widest">New Chat</span>
          </button>
        </div>

        <nav className="flex-1 px-6 overflow-y-auto scrollbar-hide space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-4 px-2">History</p>
          {conversations.map((conv) => (
            <div 
              key={conv.id}
              onClick={() => {
                if (editingId === conv.id) return;
                setActiveConversationId(conv.id);
                setSidebarOpen(false);
              }}
              className={cn(
                "group relative flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all border border-transparent",
                activeConversationId === conv.id 
                  ? "bg-indigo-500/10 text-indigo-400 border-white/5" 
                  : "text-white/40 hover:bg-white/[0.03] hover:text-white/80"
              )}
            >
              <div className="flex items-center gap-3 overflow-hidden flex-1">
                <MessageSquare className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-100" />
                {editingId === conv.id ? (
                  <form onSubmit={(e) => renameConversation(e, conv.id)} className="flex-1">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={(e) => renameConversation(e as any, conv.id)}
                      className="bg-transparent border-none text-xs font-semibold w-full focus:outline-none p-0 text-white"
                    />
                  </form>
                ) : (
                  <span className="text-xs font-semibold truncate tracking-tight">{conv.title}</span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(conv.id);
                    setEditTitle(conv.title);
                  }}
                  className="p-1.5 hover:text-indigo-400 transition-all"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button 
                  onClick={(e) => deleteConversation(e, conv.id)}
                  className="p-1.5 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="p-8 text-center space-y-4">
               <div className="w-12 h-12 rounded-full border border-white/5 flex items-center justify-center mx-auto opacity-20">
                 <History className="w-5 h-5" />
               </div>
               <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">No threads yet</p>
            </div>
          )}
        </nav>

        {/* User Profile Hook */}
        <div className="p-6 mt-auto space-y-4">
          <div 
            onClick={() => setShowSupportMail(!showSupportMail)}
            className="flex items-center justify-center p-4 rounded-2xl bg-white/[0.02] border border-white/5 group cursor-pointer hover:bg-white/5 transition-all relative"
          >
            <div className={cn(
              "p-3 rounded-xl transition-all flex items-center gap-3",
              showSupportMail ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/40 group-hover:text-emerald-400"
            )}>
              <LifeBuoy className="w-5 h-5" />
              <AnimatePresence>
                {showSupportMail && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    <p className="text-[11px] font-bold tracking-tight">manikantasaivootla@gmail.com</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="p-4 glass-premium rounded-2xl border border-white/5 space-y-4 relative overflow-hidden group">
            <div className="flex items-center gap-3">
               <img src={user.photoURL || ''} className="w-10 h-10 rounded-xl border border-white/10" alt="Profile" />
               <div className="overflow-hidden">
                  <p className="text-xs font-black text-white truncate truncate max-w-[120px]">{user.displayName}</p>
                  <p className="text-[10px] text-white/30 truncate">{user.email}</p>
               </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white hover:bg-red-500/10 transition-all group/logout"
            >
              <LogOut className="w-3.5 h-3.5 group-hover/logout:text-red-400" /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Experience */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 p-2 sm:p-4 lg:p-8">
        <div className="flex-1 flex flex-col glass rounded-[1.5rem] sm:rounded-[3rem] border-white/[0.03] overflow-hidden relative shadow-2xl">
          {/* Header */}
          <header className="h-16 sm:h-24 flex items-center justify-between px-6 sm:px-10 border-b border-white/[0.03] shrink-0 relative">
            <div className="flex items-center gap-4 z-10">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 text-white/60 hover:text-white"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <p className="text-[10px] font-bold text-white tracking-[0.2em] uppercase">Intelligence Node: Active</p>
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-[10px] text-white/40 font-black tracking-[0.3em] uppercase tabular-nums">
                  {currentTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-6 z-10">
                <div className="hidden xs:flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Secure Session</span>
                </div>
                <Logo hideVersion />
            </div>
          </header>

          {/* Chat Workspace */}
          <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden backdrop-blur-xl">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-12 md:px-20 md:py-16 space-y-12 scrollbar-hide"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto space-y-12 text-center py-12">
                   <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center relative group">
                      <Sparkles className="w-10 h-10 text-indigo-400 group-hover:scale-125 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-indigo-400/10 blur-2xl rounded-full opacity-50" />
                   </div>
                   <div className="space-y-4">
                      <h2 className="text-4xl sm:text-5xl font-display font-bold text-white tracking-tight italic">How can I assist <br /> your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">Intelligence</span> today?</h2>
                      <p className="text-white/30 text-sm font-medium tracking-wide">Select a query below or initiate a new synthesis session.</p>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                      <SuggestionCard 
                        title="Quantum Analysis" 
                        description="Synthesize potential outcomes for topological data structures" 
                        onClick={() => setInput("Synthesize topological data outcomes...")}
                      />
                      <SuggestionCard 
                        title="Strategic Audit" 
                        description="Audit current neural architecture for efficiency bottlenecks" 
                        onClick={() => setInput("Perform strategic neural audit...")}
                      />
                   </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto w-full space-y-12">
                  {messages.map((message, i) => (
                    <MessageBubble key={message.id || i} message={message} />
                  ))}
                  {isLoading && <LoadingBubble />}
                </div>
              )}
            </div>

            {/* Input Component */}
            <div className="px-4 py-6 sm:px-10 sm:py-10 md:px-20 bg-gradient-to-t from-[#030303] via-[#030303]/80 to-transparent">
              <div className="max-w-3xl mx-auto relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[1.5rem] sm:rounded-[2.5rem] blur-2xl opacity-10 group-focus-within:opacity-25 transition-all duration-700" />
                <form 
                  onSubmit={handleSubmit} 
                  className="relative flex items-center gap-3 bg-[#0a0a0b]/90 border border-white/10 rounded-[1.5rem] sm:rounded-2xl p-2 sm:p-3 backdrop-blur-3xl focus-within:border-indigo-500/40 transition-all shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/[0.03] hover:bg-white/10 border border-white/[0.05] items-center justify-center transition-all group/paper"
                  >
                    <Paperclip className="w-5 h-5 opacity-40 group-hover/paper:opacity-100 group-hover/paper:text-indigo-400 transition-all" />
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                  </button>
                  
                  <div className="flex-1 relative flex items-center min-w-0">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit(e as any);
                        }
                      }}
                      rows={1}
                      placeholder="Ask Mani anything..."
                      className="w-full bg-transparent border-none py-3 px-2 sm:px-0 text-sm focus:outline-none focus:ring-0 text-white placeholder:text-white/10 font-bold resize-none min-h-[44px] max-h-48 scrollbar-hide flex items-center"
                      style={{ height: 'auto', minHeight: '44px' }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 192)}px`;
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={cn(
                        "hidden xs:flex p-2.5 rounded-xl transition-all duration-300",
                        isListening 
                          ? "bg-red-500/20 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]" 
                          : "text-white/20 hover:text-indigo-400 hover:bg-white/5"
                      )}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                    <button 
                      disabled={isLoading || !input.trim()}
                      type="submit" 
                      className="h-10 sm:h-12 w-10 sm:w-16 rounded-xl bg-white text-black hover:bg-indigo-500 hover:text-white transition-all active:scale-95 disabled:opacity-10 flex items-center justify-center shrink-0 shadow-lg"
                    >
                      <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Components
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full mb-10 last:mb-0", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[75%] sm:max-w-[85%] lg:max-w-[80%] flex flex-col gap-3", isUser ? "items-end text-right" : "items-start")}>
        <div className={cn("flex items-center gap-3 px-2 mb-1", isUser && "flex-row-reverse")}>
           <div className={cn(
             "w-6 h-6 rounded-lg flex items-center justify-center",
             isUser ? "bg-white/10" : "bg-indigo-500/10"
           )}>
             {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
           </div>
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
             {isUser ? 'Human Subject' : 'Neural Core'}
           </span>
        </div>

        <div className={cn(
          "px-8 py-7 rounded-[2rem] shadow-2xl relative overflow-hidden backdrop-blur-3xl border text-base font-medium leading-relaxed",
          isUser 
            ? "bg-white/[0.08] border-white/20 text-white rounded-tr-none" 
            : "bg-[#0B0B0C] border-white/5 text-white/90 rounded-tl-none shadow-black/40"
        )}>
          {message.fileUrl && (
            <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-4 group cursor-pointer hover:bg-white/10 transition-all">
               <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-indigo-400" />
               </div>
               <div className="text-left overflow-hidden">
                  <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Document Attachment</p>
                  <p className="text-xs text-white/80 font-bold truncate">{message.fileName}</p>
               </div>
            </div>
          )}
          <div className="prose prose-invert prose-indigo max-w-none prose-p:leading-relaxed">
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  return !inline ? (
                    <CodeBlock className={className} {...props}>{children}</CodeBlock>
                  ) : (
                    <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-indigo-300" {...props}>{children}</code>
                  )
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LoadingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-white/[0.01] border border-white/5 px-8 py-6 rounded-[1.5rem] rounded-tl-none flex gap-2 items-center">
        <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
      </div>
    </div>
  );
}

function CodeBlock({ children, className, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const match = /language-(\w+)/.exec(className || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-6 border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 bg-white/[0.03] border-b border-white/5">
        <span className="text-[9px] font-black tracking-[0.3em] text-white/30 uppercase">{match ? match[1] : 'Neural Code'}</span>
        <button onClick={handleCopy} className="text-white/40 hover:text-white transition-all">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="p-6 bg-[#030303] overflow-x-auto scrollbar-hide">
        <code className="text-xs sm:text-sm font-mono leading-relaxed" {...props}>{children}</code>
      </pre>
    </div>
  );
}

function Logo({ hideVersion = false, onClick }: { hideVersion?: boolean, onClick?: () => void }) {
  return (
    <div className="flex items-center gap-4 group cursor-pointer select-none" onClick={onClick}>
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-2xl shadow-indigo-500/40 relative overflow-hidden group-hover:scale-105 transition-transform duration-500">
        <Sparkles className="w-6 h-6 text-white relative z-10" />
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex flex-col">
        <span className="font-display text-2xl font-bold tracking-tighter text-white italic" style={{ fontFamily: 'Arial' }}>
          Mani AI
        </span>
        {!hideVersion && (
          <span className="text-[9px] font-black tracking-[0.5em] text-indigo-400 uppercase opacity-50">
            Enterprise v3
          </span>
        )}
      </div>
    </div>
  );
}

function SuggestionCard({ title, description, onClick }: { title: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="p-8 rounded-[2rem] bg-white/[0.015] border border-white/5 hover:border-indigo-500/40 hover:bg-white/[0.03] text-left transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.08] transition-opacity">
        <Sparkles className="w-20 h-20" />
      </div>
      <h4 className="text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest">{title}</h4>
      <p className="text-sm text-white/30 font-medium leading-relaxed group-hover:text-white/60 transition-all">{description}</p>
    </button>
  );
}
