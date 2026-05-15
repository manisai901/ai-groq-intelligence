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
  const [streamingContent, setStreamingContent] = useState<{ id: string, content: string } | null>(null);
  const [isConfigMode, setIsConfigMode] = useState(false);
  const [configStatus, setConfigStatus] = useState<{ hasKey: boolean, checked: boolean }>({ hasKey: false, checked: false });

  // Check config on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const r = await fetch('/api/check-config');
        const data = await r.json();
        setConfigStatus({ hasKey: data.hasGroqKey, checked: true });
        if (!data.hasGroqKey) {
          console.warn("GROQ_API_KEY missing");
        }
      } catch (e) {
        setConfigStatus(prev => ({ ...prev, checked: true }));
      }
    };
    checkConfig();
  }, []);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authentication logic
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef).catch(err => {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        return null;
      });

      if (userSnap && !userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`));
      } else if (userSnap) {
        await updateDoc(userRef, {
          displayName: user.displayName,
          photoURL: user.photoURL,
          lastLoginAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
      }
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        alert("Domain Not Authorized: Please add this domain to Authorized Domains in Firebase Authentication Settings.");
      }
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
  const [conversationsSnapshot, loadingConversations, convError] = useCollection(
    user ? query(
      collection(db, 'conversations'),
      where('userId', '==', user.uid)
    ) : null
  );

  if (convError) {
    console.error("Conversations fetch error:", convError);
  }

  const conversations = conversationsSnapshot?.docs.map(doc => {
    const data = doc.data({ serverTimestamps: 'estimate' });
    return {
      id: doc.id,
      ...data
    } as Conversation;
  }).sort((a, b) => {
    const t1 = a.lastUpdatedAt instanceof Date ? a.lastUpdatedAt.getTime() : (a.lastUpdatedAt as any)?.toDate?.()?.getTime() || 0;
    const t2 = b.lastUpdatedAt instanceof Date ? b.lastUpdatedAt.getTime() : (b.lastUpdatedAt as any)?.toDate?.()?.getTime() || 0;
    return t2 - t1; // desc
  }) || [];

  const [selectionDoneUserId, setSelectionDoneUserId] = useState<string | null>(null);

  // Auto-select first conversation if available
  useEffect(() => {
    if (user && !loadingConversations && user.uid !== selectionDoneUserId) {
      if (conversations.length > 0) {
        setActiveConversationId(conversations[0].id);
        setSelectionDoneUserId(user.uid);
      } else if (conversations.length === 0) {
        // If it's truly empty after loading, we mark it as checked for this user
        setSelectionDoneUserId(user.uid);
      }
    }
  }, [user, conversations, loadingConversations, selectionDoneUserId]);

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
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data({ serverTimestamps: 'estimate' });
        let ts = new Date();
        if (data.timestamp) {
          if (typeof data.timestamp.toDate === 'function') {
            ts = data.timestamp.toDate();
          } else if (data.timestamp instanceof Date) {
            ts = data.timestamp;
          } else if (typeof data.timestamp === 'number' || typeof data.timestamp === 'string') {
            ts = new Date(data.timestamp);
          }
        }
        return {
          id: doc.id,
          ...data,
          timestamp: ts
        } as Message;
      });
      
      // Sort client-side to be absolutely certain
      msgs.sort((a, b) => (a.timestamp as any).getTime() - (b.timestamp as any).getTime());
      
      setMessages(msgs);
    }, (error) => {
      console.error("Messages Subscription Error:", error);
    });

    return () => unsubscribe();
  }, [activeConversationId, user]);

  const startNewConversation = useCallback(async () => {
    setActiveConversationId(null);
    setMessages([]);
    setSidebarOpen(false);
  }, []);

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
    setIsLoading(true);
    
    let currentConvId = activeConversationId;
    
    // Create new conversation document locally and set ID immediately
    if (!currentConvId) {
      const newConvRef = doc(collection(db, 'conversations'));
      currentConvId = newConvRef.id;
      setActiveConversationId(currentConvId);
      
      setDoc(newConvRef, {
        userId: user.uid,
        title: userMessage.slice(0, 30),
        createdAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp()
      }).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, `conversations/${newConvRef.id}`);
      });
    }

    try {
      // 1. Add user message locally for instant feedback
      const localUserMsg: Message = {
        id: 'temp-user-' + Date.now(),
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, localUserMsg]);

      // 2. Save user message to Firestore in background
      addDoc(collection(db, 'conversations', currentConvId, 'messages'), {
        role: 'user',
        content: userMessage,
        timestamp: serverTimestamp()
      }).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, `conversations/${currentConvId}/messages`);
      });

      console.log("Calling backend synthesis...");
      // 3. Call backend for streaming response
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server Error (${response.status})`);
      }
      
      const tempId = 'streaming-' + Date.now();
      setStreamingContent({ id: tempId, content: '_Neural synthesis in progress..._' });

      let assistantText = '';
      const decoder = new TextDecoder();
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response reader available");

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;
            
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch (e) {
              continue;
            }
            
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              if (assistantText === '') assistantText = parsed.text;
              else assistantText += parsed.text;
              setStreamingContent({ id: tempId, content: assistantText });
            }
          }
        }
      }
      
      setStreamingContent(null);

      // 4. Save full assistant message to Firestore in background
      if (assistantText.trim()) {
        addDoc(collection(db, 'conversations', currentConvId, 'messages'), {
          role: 'assistant',
          content: assistantText,
          timestamp: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, `conversations/${currentConvId}/messages`));
      }

      // Update conversation metadata
      updateDoc(doc(db, 'conversations', currentConvId), {
        lastUpdatedAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `conversations/${currentConvId}`));

    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || "Synthesis failed. Please verify your Groq API Key in the Settings menu.";
      
      setMessages(prev => [...prev, {
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: `**SYSTEM ALERT:** ${errorMsg}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      setStreamingContent(null);
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
      
      {convError && (
        <div className="absolute top-0 inset-x-0 bg-red-500/20 text-red-100 p-2 text-xs z-50 text-center font-mono">
          Sidebar Data Link Error: {convError.message}
        </div>
      )}

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
        "fixed lg:static inset-y-0 left-0 w-60 sidebar-glass z-50 shrink-0 flex flex-col transition-transform duration-300 transform lg:translate-x-0 outline-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 pb-2 flex items-center justify-between">
          <Logo onClick={() => setSidebarOpen(false)} />
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3 mb-3">
          <button 
            onClick={startNewConversation}
            className="w-full p-2.5 glass-premium rounded-lg border border-white/5 flex items-center gap-2 text-indigo-400 hover:bg-white/5 transition-all group"
          >
            <div className="p-1 rounded-md bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-all">
              <Plus className="w-3 h-3" />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest">New Chat</span>
          </button>
        </div>

        <nav className="flex-1 px-2.5 overflow-y-auto scrollbar-hide space-y-0.5">
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/20 mb-1.5 px-2">History</p>
          
          {loadingConversations && conversations.length === 0 && (
            <div className="p-4 text-center">
              <Loader2 className="w-4 h-4 text-white/20 animate-spin mx-auto mb-2" />
              <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Syncing history...</p>
            </div>
          )}

          {convError && (
            <div className="p-4 text-center">
               <p className="text-[8px] font-bold text-red-400 uppercase tracking-widest mb-1">Sync Error</p>
               <p className="text-[7px] text-white/20 line-clamp-2">{convError.message}</p>
            </div>
          )}

          {conversations.map((conv) => (
            <div 
              key={conv.id}
              onClick={() => {
                if (editingId === conv.id) return;
                setActiveConversationId(conv.id);
                setSidebarOpen(false);
              }}
              className={cn(
                "group relative flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border border-transparent",
                activeConversationId === conv.id 
                  ? "bg-indigo-500/10 text-indigo-400 border-white/5" 
                  : "text-white/40 hover:bg-white/[0.03] hover:text-white/80"
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <MessageSquare className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-100" />
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

        {/* User Profile - Compact */}
        <div className="p-3 mt-auto space-y-2">
          <div 
            onClick={() => setShowSupportMail(!showSupportMail)}
            className="flex items-center justify-center p-2 rounded-lg bg-white/[0.02] border border-white/5 group cursor-pointer hover:bg-white/5 transition-all"
          >
            <div className={cn(
              "flex items-center gap-1.5 transition-all text-white/40 group-hover:text-emerald-400",
              showSupportMail && "text-emerald-400"
            )}>
              <LifeBuoy className="w-3 h-3" />
              <AnimatePresence>
                {showSupportMail && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    <p className="text-[8px] font-bold tracking-tight">manikantasaivootla@gmail.com</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="p-2.5 glass-premium rounded-xl border border-white/5 space-y-2 relative overflow-hidden group">
            <div className="flex items-center gap-2">
               <img src={user.photoURL || ''} className="w-6 h-6 rounded-md border border-white/10" alt="Profile" />
               <div className="overflow-hidden">
                  <p className="text-[9px] font-black text-white truncate max-w-[100px]">{user.displayName}</p>
               </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-1.5 p-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-[8px] font-bold uppercase tracking-widest text-white/30 hover:text-white hover:bg-red-500/10 transition-all group/logout"
            >
              <LogOut className="w-2.5 h-2.5 group-hover/logout:text-red-400" /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Experience */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 p-2 sm:p-4 lg:p-8">
        <div className="flex-1 flex flex-col glass rounded-[1.5rem] sm:rounded-[3rem] border-white/[0.03] overflow-hidden relative shadow-2xl">
          {/* Header */}
          <header className="h-12 flex items-center justify-between px-4 border-b border-white/[0.03] shrink-0 relative">
            <div className="flex items-center gap-4 z-10">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 text-white/60 hover:text-white"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="hidden sm:flex items-center gap-3">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse shadow-lg",
                  configStatus.hasKey ? "bg-emerald-500 shadow-emerald-500/50" : "bg-red-500 shadow-red-500/50"
                )} />
                <p className="text-[10px] font-bold text-white tracking-[0.2em] uppercase">
                  {configStatus.hasKey ? "Synthesis Engine: Online" : "Synthesis Engine: Error"}
                </p>
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
              className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 md:px-10 md:py-8 space-y-6 scrollbar-hide"
            >
              {messages.length === 0 && !streamingContent && !isLoading ? (
                <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto space-y-6 text-center py-6">
                   <div className="w-12 h-12 rounded-[1.2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center relative group">
                      <Sparkles className="w-6 h-6 text-indigo-400 group-hover:scale-125 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-indigo-400/10 blur-xl rounded-full opacity-50" />
                   </div>
                   <div className="space-y-2">
                      <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight italic">How can I assist <br /> your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">Intelligence</span> today?</h2>
                      <p className="text-white/30 text-[10px] font-medium tracking-wide">Select a query below or initiate a new synthesis session.</p>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                      <SuggestionCard 
                        title="Quantum Analysis" 
                        description="Synthesize topological data outcomes" 
                        onClick={() => setInput("Synthesize topological data outcomes...")}
                      />
                      <SuggestionCard 
                        title="Strategic Audit" 
                        description="Audit neural architecture for bottlenecks" 
                        onClick={() => setInput("Perform strategic neural audit...")}
                      />
                   </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto w-full space-y-6 text-xs font-medium leading-relaxed">
                  {messages.map((message, i) => (
                    <MessageBubble key={message.id || i} message={message} />
                  ))}
                  {streamingContent && (
                    <MessageBubble 
                      message={{ 
                        id: streamingContent.id, 
                        role: 'assistant', 
                        content: streamingContent.content, 
                        timestamp: new Date() 
                      }} 
                    />
                  )}
                  {isLoading && !streamingContent && (
                    <div className="flex gap-2 p-4 text-white/20 italic animate-pulse text-[10px]">
                      Synthesizing intelligence...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Component */}
            <div className="px-4 py-4 sm:px-8 sm:py-6 md:px-16 bg-gradient-to-t from-[#030303] via-[#030303]/80 to-transparent">
              <div className="max-w-3xl mx-auto relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-xl sm:rounded-2xl blur-xl opacity-10 group-focus-within:opacity-20 transition-all duration-700" />
                <form 
                  onSubmit={handleSubmit} 
                  className="relative flex items-center gap-2 bg-[#0a0a0b]/90 border border-white/10 rounded-lg sm:rounded-xl p-1 sm:p-1.5 backdrop-blur-3xl focus-within:border-indigo-500/40 transition-all shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white/[0.03] hover:bg-white/10 border border-white/[0.05] items-center justify-center transition-all group/paper"
                  >
                    <Paperclip className="w-4 h-4 opacity-40 group-hover/paper:opacity-100 group-hover/paper:text-indigo-400 transition-all" />
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
                      placeholder="Ask Mani..."
                      className="w-full bg-transparent border-none py-2 px-1.5 sm:px-0 text-[13px] focus:outline-none focus:ring-0 text-white placeholder:text-white/10 font-bold resize-none min-h-[36px] max-h-32 scrollbar-hide flex items-center"
                      style={{ height: 'auto', minHeight: '36px' }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
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
                      className="h-9 sm:h-10 w-10 sm:w-12 rounded-lg bg-white text-black hover:bg-indigo-500 hover:text-white transition-all active:scale-95 disabled:opacity-10 flex items-center justify-center shrink-0 shadow-lg"
                    >
                      <Send className="w-3.5 h-3.5 sm:w-4 h-4" />
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full mb-6 last:mb-0", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[85%] sm:max-w-[75%] lg:max-w-[70%] flex flex-col gap-1.5", isUser ? "items-end text-right" : "items-start")}>
        <div className={cn("flex items-center gap-1.5 px-1 mb-0.5", isUser && "flex-row-reverse")}>
           <div className={cn(
             "w-5 h-5 rounded-md flex items-center justify-center",
             isUser ? "bg-white/10" : "bg-indigo-500/10"
           )}>
             {isUser ? <UserIcon className="w-3 h-3" /> : <Sparkles className="w-3 h-3 text-indigo-400" />}
           </div>
           <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
             {isUser ? 'Human Subject' : 'Neural Core'}
           </span>
        </div>

        <div className={cn(
          "px-3 py-2.5 rounded-lg shadow-xl relative overflow-hidden backdrop-blur-3xl border text-[11px] font-medium leading-relaxed",
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
          <div className="prose prose-sm prose-invert prose-indigo max-w-none prose-p:leading-relaxed text-white/90">
            <div className="markdown-body">
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
    <div className="relative group/code my-4 border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/5">
        <span className="text-[8px] font-black tracking-[0.3em] text-white/30 uppercase">{match ? match[1] : 'Neural Code'}</span>
        <button onClick={handleCopy} className="text-white/40 hover:text-white transition-all">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      <pre className="p-4 bg-[#030303] overflow-x-auto scrollbar-hide">
        <code className="text-[11px] sm:text-xs font-mono leading-relaxed" {...props}>{children}</code>
      </pre>
    </div>
  );
}

function Logo({ hideVersion = false, onClick }: { hideVersion?: boolean, onClick?: () => void }) {
  return (
    <div className="flex items-center gap-2 group cursor-pointer select-none" onClick={onClick}>
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20 relative overflow-hidden group-hover:scale-105 transition-transform duration-500">
        <Sparkles className="w-3.5 h-3.5 text-white relative z-10" />
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex flex-col">
        <span className="font-display text-sm font-bold tracking-tighter text-white italic" style={{ fontFamily: 'Arial' }}>
          Mani AI
        </span>
        {!hideVersion && (
          <span className="text-[7px] font-black tracking-[0.4em] text-indigo-400 uppercase opacity-50">
            Persistent Neural Cloud
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
      className="p-4 rounded-xl bg-white/[0.015] border border-white/5 hover:border-indigo-500/40 hover:bg-white/[0.03] text-left transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.02] group-hover:opacity-[0.08] transition-opacity">
        <Sparkles className="w-10 h-10" />
      </div>
      <h4 className="text-[8px] font-black text-indigo-400 mb-1 uppercase tracking-widest">{title}</h4>
      <p className="text-[11px] text-white/30 font-medium leading-relaxed group-hover:text-white/60 transition-all">{description}</p>
    </button>
  );
}
