/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  LogOut, 
  Menu, 
  X, 
  Mail, 
  MessageSquare, 
  History, 
  Sparkles, 
  ShieldCheck, 
  Pencil, 
  LifeBuoy,
  Loader2
} from 'lucide-react';
import { cn } from './lib/utils';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp, 
  deleteDoc,
  Timestamp,
  limit
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollection } from 'react-firebase-hooks/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, googleProvider, storage, handleFirestoreError, OperationType } from './lib/firebase';

// Components
import { MessageBubble } from './components/MessageBubble';
import { ChatInput } from './components/ChatInput';
import { Logo } from './components/Logo';
import { SuggestionCard } from './components/SuggestionCard';

// Declare SpeechRecognition types for TS
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

// Types
export interface Message {
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [showSupportMail, setShowSupportMail] = useState(false);
  const [streamingContent, setStreamingContent] = useState<{ id: string, content: string } | null>(null);
  const [configStatus, setConfigStatus] = useState<{ hasKey: boolean, checked: boolean }>({ hasKey: false, checked: false });

  // Stream reader ref to allow cleanup
  const activeReaderRef = useRef<ReadableStreamDefaultReader | null>(null);

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

  // Auto-scroll logic
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isLoading]);

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
    let lastUpdate: Date;
    if (data.lastUpdatedAt && typeof data.lastUpdatedAt.toDate === 'function') {
      lastUpdate = data.lastUpdatedAt.toDate();
    } else {
      lastUpdate = new Date(data.lastUpdatedAt || Date.now());
    }
    return {
      id: doc.id,
      ...data,
      lastUpdatedAt: lastUpdate
    } as Conversation;
  }).sort((a, b) => {
    const t1 = a.lastUpdatedAt instanceof Date ? a.lastUpdatedAt.getTime() : 0;
    const t2 = b.lastUpdatedAt instanceof Date ? b.lastUpdatedAt.getTime() : 0;
    return t2 - t1;
  }) || [];

  const formatDistance = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

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

  const prevConvIdRef = useRef<string | null>(null);

  // Fetch messages when activeConversationId changes
  useEffect(() => {
    // Only clear if we are switching between different existing conversations
    if (activeConversationId && prevConvIdRef.current && activeConversationId !== prevConvIdRef.current) {
      setMessages([]);
    }
    prevConvIdRef.current = activeConversationId;

    if (!activeConversationId || !user) {
      if (!activeConversationId) setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'conversations', activeConversationId, 'messages'),
      where('userId', '==', user.uid)
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
          }
        }
        return {
          id: doc.id,
          ...data,
          timestamp: ts
        } as Message;
      });
      
      setMessages(prev => {
        // Find existing non-optimistic IDs
        const existingIds = new Set(msgs.map(m => m.id));
        // Keep optimistic messages that haven't been saved yet
        const pendingOptimistic = prev.filter(m => m.id?.endsWith('-optimistic') && !msgs.some(real => real.content === m.content && real.role === m.role));
        
        const combined = [...msgs, ...pendingOptimistic].sort((a, b) => {
          const t1 = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
          const t2 = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
          return t1 - t2;
        });

        // Deduplicate content if needed (simple check)
        return combined.filter((m, i, arr) => {
          if (!m.id?.endsWith('-optimistic')) return true;
          // Only keep optimistic if no real one matches content/role
          return !arr.some(other => !other.id?.endsWith('-optimistic') && other.content === m.content && other.role === m.role);
        });
      });
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
        timestamp: serverTimestamp(),
        userId: user.uid
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

    // 1. Instant UI update (Optimistic) - Move to very top
    const localUserMsg: Message = {
      id: 'msg-' + Date.now() + '-user-optimistic',
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, localUserMsg]);
    
    let currentConvId = activeConversationId;
    
    try {
      // Create new conversation document if needed
      if (!currentConvId) {
        const newConvRef = doc(collection(db, 'conversations'));
        currentConvId = newConvRef.id;
        setActiveConversationId(currentConvId);
        
        await setDoc(newConvRef, {
          userId: user.uid,
          title: userMessage.slice(0, 30),
          createdAt: serverTimestamp(),
          lastUpdatedAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, `conversations/${newConvRef.id}`));
      }

      // Check limit
      const MAX_CHARS = 1000;
      if (userMessage.length > MAX_CHARS) {
        setMessages(prev => [...prev, {
          id: 'err-' + Date.now(),
          role: 'assistant',
          content: `**Neural Overflow:** Message exceeding ${MAX_CHARS} char limit.`,
          timestamp: new Date()
        }]);
        setIsLoading(false);
        return;
      }

      const inputBody = JSON.stringify({
        message: userMessage,
        history: messages.slice(-20).map(m => ({ 
          role: m.role,
          content: m.content
        }))
      });

      // 2. Persist user message fully
      const msgColl = collection(db, 'conversations', currentConvId, 'messages');
      addDoc(msgColl, {
        role: 'user',
        content: userMessage,
        timestamp: new Date(), 
        userId: user.uid
      }).catch(err => console.error("Firestore sync err:", err));

      // 3. Initiate Synthesis
      if (activeReaderRef.current) {
        try { activeReaderRef.current.cancel(); } catch(e) {}
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); 

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: inputBody
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Synthesis Link Failure: ${response.status}`);
      }

      setStreamingContent({ id: 'streaming-' + Date.now(), content: '' });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Neural signal channel initialization failed.");
      activeReaderRef.current = reader;

      let assistantText = '';
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        let isDone = false;
        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data: ')) continue;
            
            const raw = trimmed.slice(6).trim();
            if (raw === '[DONE]') {
              isDone = true;
              break;
            }
            
            try {
              const data = JSON.parse(raw);
              if (data.text) {
                assistantText += data.text;
                setStreamingContent(prev => ({ 
                  id: prev?.id || 'streaming-' + Date.now(), 
                  content: assistantText 
                }));
              } else if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              console.warn("JSON Parse err in bit-stream:", e);
            }
          }
        }
      } finally {
        activeReaderRef.current = null;
        setStreamingContent(null);
        setIsLoading(false);
      }

      // 4. Finalize Assistant persistence
      if (assistantText.trim()) {
        try {
          const finalMsg = {
            role: 'assistant',
            content: assistantText,
            timestamp: new Date(), // Use JS Date
            userId: user.uid
          };
          
          await Promise.all([
            addDoc(msgColl, finalMsg),
            updateDoc(doc(db, 'conversations', currentConvId), {
              lastUpdatedAt: serverTimestamp()
            })
          ]);
        } catch (e) {
          console.error("History sync failure (assistant):", e);
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Chat Error:", error);
      
      setMessages(prev => [...prev, {
        id: 'err-' + Date.now(),
        role: 'assistant',
        content: `**Core System Failure:** ${error.message || "The neural link was severed unexpectedly."}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      setStreamingContent(null);
      activeReaderRef.current = null;
    }
  };

  const handleClearInput = () => setInput('');

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
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.1),transparent_70%)]" />
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
    <div className="relative flex h-screen w-full bg-[#030303] overflow-hidden font-sans text-white/90 selection:bg-indigo-500/30">
      
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,70,229,0.03),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.03),transparent_50%)]" />
      </div>

      {convError && (
        <div className="absolute top-0 inset-x-0 bg-red-500/20 text-red-100 p-2 text-xs z-50 text-center font-mono">
          Sidebar Data Link Error: {convError.message}
        </div>
      )}

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
        "fixed lg:static inset-y-0 left-0 w-64 sidebar-glass z-50 shrink-0 flex flex-col transition-transform duration-300 transform lg:translate-x-0 outline-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-5 pb-2 flex items-center justify-between">
          <Logo enterprise onClick={() => setSidebarOpen(false)} />
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
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-semibold truncate tracking-tight">{conv.title}</span>
                    <span className="text-[7px] font-bold text-white/20 uppercase tracking-tighter">
                      {formatDistance(conv.lastUpdatedAt instanceof Date ? conv.lastUpdatedAt : (conv.lastUpdatedAt as any)?.toDate?.() || new Date())}
                    </span>
                  </div>
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

      {/* Chat Workspace */}
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
                <div className="flex flex-col">
                  <p className="text-[9px] font-bold text-white tracking-[0.2em] uppercase">
                    {configStatus.hasKey ? "Intelligence Active" : "Synthesis Error"}
                  </p>
                  <p className="text-[7px] font-black text-indigo-400/60 uppercase tracking-[0.3em]">Active Engine: Groq Llama 3.3</p>
                </div>
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

          {/* Messages Area */}
          <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
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
                   <div className="space-y-4">
                      <h2 className="text-2xl sm:text-4xl font-display font-medium text-white tracking-tighter leading-tight">
                        How can MANI AI <br /> 
                        <span className="text-indigo-400 italic font-black">Synthesize</span> your <br />
                        Intelligence today?
                      </h2>
                      <div className="h-px w-12 bg-indigo-500/30 mx-auto" />
                      <p className="text-white/20 text-[10px] font-bold uppercase tracking-[0.3em]">Neural Protocol 3.5 Active</p>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-4">
                      <SuggestionCard 
                        title="Market Synthesis" 
                        description="Analyze volatile indicators and trend velocity" 
                        onClick={() => setInput("Perform a comprehensive market synthesis on the current technology sector trends...")}
                      />
                      <SuggestionCard 
                        title="Neural Audit" 
                        description="Recursive check for architectural bottlenecks" 
                        onClick={() => setInput("Analyze this neural architecture for potential scalability bottlenecks...")}
                      />
                   </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto w-full space-y-6">
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
                    <div className="flex items-center gap-2 p-4 text-white/20">
                      <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" />
                      <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Component */}
            <ChatInput 
              input={input}
              setInput={setInput}
              isLoading={isLoading}
              isListening={isListening}
              toggleListening={toggleListening}
              handleSubmit={handleSubmit}
              handleFileUpload={handleFileUpload}
              handleClearInput={handleClearInput}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
