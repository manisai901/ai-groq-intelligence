/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Mail, Loader2 } from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { db, auth, googleProvider, storage, handleFirestoreError, OperationType } from './lib/firebase';
import { Logo } from './components/Logo';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { useConversations } from './hooks/useConversations';
import { useChat } from './hooks/useChat';

export default function App() {
  const [user, authLoading] = useAuthState(auth);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [configStatus, setConfigStatus] = useState<{ hasKey: boolean, checked: boolean }>({ hasKey: false, checked: false });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Hooks
  const { 
    conversations, 
    loading: loadingConversations, 
    error: convError, 
    createConversation, 
    removeConversation, 
    renameConversation 
  } = useConversations(user?.uid);

  const { 
    messages, 
    isLoading, 
    streamingContent, 
    sendMessage 
  } = useChat(user?.uid, activeConversationId);

  // Auto-select first conversation
  const [selectionDoneUserId, setSelectionDoneUserId] = useState<string | null>(null);
  useEffect(() => {
    if (user && !loadingConversations && user.uid !== selectionDoneUserId) {
      if (conversations.length > 0) {
        setActiveConversationId(conversations[0].id);
        setSelectionDoneUserId(user.uid);
      } else if (conversations.length === 0) {
        setSelectionDoneUserId(user.uid);
      }
    }
  }, [user, conversations, loadingConversations, selectionDoneUserId]);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const r = await fetch('/api/check-config');
        const data = await r.json();
        setConfigStatus({ hasKey: data.hasGroqKey, checked: true });
      } catch (e) {
        setConfigStatus(prev => ({ ...prev, checked: true }));
      }
    };
    checkConfig();
  }, []);

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

  const startNewConversation = () => {
    setActiveConversationId(null);
    setSidebarOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeConversationId) return;

    try {
      const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'conversations', activeConversationId, 'messages'), {
        role: 'user',
        content: `Uploaded file: ${file.name}`,
        fileUrl: url,
        fileName: file.name,
        timestamp: serverTimestamp(),
        userId: user.uid
      });

      if (messages.length === 0) {
        await updateDoc(doc(db, 'conversations', activeConversationId), {
          title: file.name.slice(0, 30),
          lastUpdatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Upload failed", error);
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
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,70,229,0.03),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.03),transparent_50%)]" />
      </div>

      <Sidebar 
        user={user}
        conversations={conversations}
        loadingConversations={loadingConversations}
        convError={convError}
        activeConversationId={activeConversationId}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        startNewConversation={startNewConversation}
        setActiveConversationId={setActiveConversationId}
        deleteConversation={removeConversation}
        renameConversation={renameConversation}
        handleLogout={handleLogout}
      />

      <ChatArea 
        messages={messages}
        isLoading={isLoading}
        streamingContent={streamingContent}
        configStatus={configStatus}
        setSidebarOpen={setSidebarOpen}
        sendMessage={(content) => sendMessage(content, createConversation)}
        handleFileUpload={handleFileUpload}
        fileInputRef={fileInputRef}
      />
    </div>
  );
}
