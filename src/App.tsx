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
  Loader2,
  Search,
  Bot,
  Sun,
  Moon
} from 'lucide-react';
import { cn } from './lib/utils';
import { 
  doc, 
  getDoc, 
  getDocs,
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

interface SearchResult {
  message: Message;
  conversationId: string;
  conversationTitle: string;
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [showSupportMail, setShowSupportMail] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const [streamingContent, setStreamingContent] = useState<{ id: string, content: string } | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<{ hasKey: boolean, checked: boolean }>({ hasKey: false, checked: false });

  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [isLightMode]);

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
        console.error("Firestore getDoc error (likely database not created yet):", err);
        return null;
      });

      if (userSnap === null) {
        alert("Authentication succeeded, but Firestore seems to be unreachable. Please ensure you have created the Firestore Database in your Firebase Console for project 'oldproject-rebuild-purple'.");
      } else if (!userSnap.exists()) {
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

  const conversations = useMemo(() => {
    return conversationsSnapshot?.docs.map(doc => {
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
  }, [conversationsSnapshot]);

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

  useEffect(() => {
    if (!user) {
      setSelectionDoneUserId(null);
      setActiveConversationId(null);
      setMessages([]);
    }
  }, [user]);

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

  // Search logic
  useEffect(() => {
    if (!searchQuery.trim() || !user || conversations.length === 0) {
      setSearchResults(prev => prev.length === 0 ? prev : []);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const lowerQ = searchQuery.toLowerCase();
        // Fire concurrent fetches for all current user's conversations
        const calls = conversations.map(c => 
          getDocs(query(collection(db, 'conversations', c.id, 'messages')))
        );
        const docsMatches: SearchResult[] = [];
        
        const snapshots = await Promise.all(calls);
        
        snapshots.forEach((snap, idx) => {
          const conv = conversations[idx];
          snap.forEach(doc => {
            const data = doc.data();
            const textContent = data.content;
            if (typeof textContent === 'string' && textContent.toLowerCase().includes(lowerQ)) {
              let ts = new Date();
              if (data.timestamp?.toDate) ts = data.timestamp.toDate();
              else if (data.timestamp instanceof Date) ts = data.timestamp;

              docsMatches.push({
                message: { id: doc.id, ...data, timestamp: ts } as Message,
                conversationId: conv.id,
                conversationTitle: conv.title || 'Unknown Chat'
              });
            }
          });
        });

        docsMatches.sort((a, b) => (b.message.timestamp as Date).getTime() - (a.message.timestamp as Date).getTime());
        setSearchResults(docsMatches.slice(0, 25));
      } catch (err) {
        console.error("Search error", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, user, conversations]);

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
          }
        }
        return {
          id: doc.id,
          ...data,
          timestamp: ts
        } as Message;
      });
      
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

  const requestDeleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDeleteConversation = async (id: string) => {
    setDeleteConfirmId(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setChatError(null);

    let currentConvId = activeConversationId;

    try {
      if (!user) throw new Error("Must be logged in to chat.");

      if (!currentConvId) {
        const newConvRef = doc(collection(db, 'conversations'));
        currentConvId = newConvRef.id;
        setActiveConversationId(currentConvId);
        
        await setDoc(newConvRef, {
          userId: user.uid,
          title: userMessage.slice(0, 30),
          createdAt: serverTimestamp(),
          lastUpdatedAt: serverTimestamp()
        }).catch(err => console.error(err));
      }

      // Persist user message asynchronously
      const msgColl = collection(db, 'conversations', currentConvId, 'messages');
      addDoc(msgColl, {
        role: 'user',
        content: userMessage,
        timestamp: serverTimestamp(),
        userId: user.uid
      }).catch(err => console.error("Firestore sync err:", err));

      const inputBody = JSON.stringify({
        message: userMessage,
        history: messages.slice(-15).map(m => ({ 
          role: m.role,
          content: m.content
        }))
      });

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
      
      if (!response.ok) {
        clearTimeout(timeoutId);
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server Error: ${response.status}`);
      }

      setStreamingContent({ id: 'streaming-' + Date.now(), content: '' });

      const reader = response.body?.getReader();
      if (!reader) {
        clearTimeout(timeoutId);
        throw new Error("Stream reader failed.");
      }
      activeReaderRef.current = reader;

      let assistantText = '';
      const decoder = new TextDecoder();
      let buffer = '';

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
            console.warn("JSON Parse err in stream:", e);
          }
        }
      }

      clearTimeout(timeoutId);
      activeReaderRef.current = null;
      setStreamingContent(null);
      setIsLoading(false);

      if (assistantText.trim()) {
        await Promise.all([
          addDoc(msgColl, {
            role: 'assistant',
            content: assistantText,
            timestamp: serverTimestamp(),
            userId: user.uid
          }),
          updateDoc(doc(db, 'conversations', currentConvId), {
            lastUpdatedAt: serverTimestamp()
          })
        ]);
      }

    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Chat Error:", error);
      
      setChatError(`**Error:** ${error.message}`);
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
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
              <Bot className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">Welcome</h1>
            <p className="text-white/40 text-sm leading-relaxed">
              Log in to save your conversation history and access your real-time chats across devices.
            </p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full h-14 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-white/90 transition-all active:scale-95"
          >
            <Mail className="w-5 h-5" />
            Continue with Google
          </button>
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

        <div className="px-3 mb-2">
          <div className="relative">
             <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
             <input type="text" placeholder="SEARCH HISTORY..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white/[0.02] border border-white/5 rounded-lg pl-7 pr-3 py-2 text-[9px] font-bold text-white placeholder-white/30 outline-none uppercase tracking-widest focus:bg-white/5 transition-all" />
          </div>
        </div>

        <nav className="flex-1 px-2.5 overflow-y-auto scrollbar-hide space-y-0.5">
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/20 mb-1.5 px-2">
            {searchQuery.trim() ? "Search Results" : "History"}
          </p>
          
          {searchQuery.trim() ? (
            isSearching ? (
              <div className="p-4 text-center">
                <Loader2 className="w-4 h-4 text-white/20 animate-spin mx-auto mb-2" />
                <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Searching...</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">No results found</p>
              </div>
            ) : (
              searchResults.map((result) => (
                <div 
                  key={result.message.id}
                  onClick={() => {
                    setActiveConversationId(result.conversationId);
                    setSidebarOpen(false);
                    setSearchQuery('');
                  }}
                  className="group relative flex flex-col gap-1 p-2.5 rounded-lg cursor-pointer transition-all border border-transparent hover:bg-white/[0.03] text-left"
                >
                  <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest line-clamp-1">{result.conversationTitle}</p>
                  <p className="text-xs text-white/60 line-clamp-2 leading-snug">{result.message.content}</p>
                </div>
              ))
            )
          ) : (
            <>
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
                      onClick={(e) => requestDeleteConversation(e, conv.id)}
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
            </>
          )}
        </nav>

        {/* User Profile - Compact */}
        <div className="p-3 mt-auto border-t border-white/5 space-y-2">
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

          <div className="flex items-center gap-2 mb-2">
             {user?.photoURL ? <img src={user.photoURL} className="w-6 h-6 rounded-md border border-white/10" alt="Profile" /> : <div className="w-6 h-6 rounded-md border border-white/10 bg-white/5" />}
             <div className="overflow-hidden">
                <p className="text-[9px] font-black text-white truncate max-w-[100px]">{user?.displayName || "Guest Agent"}</p>
             </div>
          </div>
          {user ? (
            <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-1.5 p-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-[8px] font-bold uppercase tracking-widest text-white/30 hover:text-white hover:bg-red-500/10 transition-all group/logout"
            >
              <LogOut className="w-2.5 h-2.5 group-hover/logout:text-red-400" /> Sign Out
            </button>
          ) : (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-1.5 p-1.5 rounded-lg bg-white/[0.02] border border-white/5 text-[8px] font-bold uppercase tracking-widest text-white/30 hover:text-white hover:bg-indigo-500/10 transition-all group/logout"
            >
              <Mail className="w-2.5 h-2.5 group-hover/logout:text-indigo-400" /> Sign In
            </button>
          )}
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
            </div>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-[10px] text-white/40 font-black tracking-[0.3em] uppercase tabular-nums">
                  {currentTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-6 z-10">
                <button
                  onClick={() => setIsLightMode(!isLightMode)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all border border-transparent hover:border-white/10"
                  title="Toggle Display Mode"
                >
                  {isLightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
                <Logo hideVersion />
            </div>
          </header>

          {/* Messages Area */}
          <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 md:px-10 md:py-8 space-y-6 scrollbar-hide border"
              style={{ borderColor: '#b64242', backgroundColor: '#5a3030' }}
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
                  {streamingContent && streamingContent.content !== '' && (
                    <MessageBubble 
                      message={{ 
                        id: streamingContent.id, 
                        role: 'assistant', 
                        content: streamingContent.content, 
                        timestamp: new Date() 
                      }} 
                    />
                  )}
                  {chatError && (
                    <MessageBubble 
                      message={{ 
                        id: 'error', 
                        role: 'assistant', 
                        content: chatError, 
                        timestamp: new Date() 
                      }} 
                    />
                  )}
                  {isLoading && (!streamingContent || streamingContent.content === '') && (
                    <div className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl w-fit">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse [animation-delay:0.4s]" />
                      </div>
                      <span className="text-xs font-medium text-white/50 uppercase tracking-widest">
                        Synthesizing intelligence...
                      </span>
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
              handleClearInput={handleClearInput}
            />
          </div>
        </div>
      </main>
      
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass p-6 rounded-2xl border border-white/10 max-w-sm w-full space-y-4 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-white">Delete Chat Thread?</h3>
              <p className="text-white/60 text-sm">This action cannot be undone and will permanently remove this conversation history.</p>
              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmDeleteConversation(deleteConfirmId)}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-500 text-sm font-medium transition-colors border border-red-500/30"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
