import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Message } from '../types';

export function useChat(userId: string | undefined, activeConversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<{ id: string, content: string } | null>(null);
  
  const activeReaderRef = useRef<ReadableStreamDefaultReader | null>(null);
  const prevConvIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Clear messages if conversation changes to a different existing one
    if (activeConversationId && prevConvIdRef.current && activeConversationId !== prevConvIdRef.current) {
      setMessages([]);
    }
    prevConvIdRef.current = activeConversationId;

    if (!activeConversationId || !userId) {
      if (!activeConversationId) setMessages([]);
      return;
    }

    // Try orderBy first, fallback to client sort if no index
    const q = query(
      collection(db, 'conversations', activeConversationId, 'messages'),
      where('userId', '==', userId),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(docSnap => {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        let ts = new Date();
        if (data.timestamp) {
          if (typeof data.timestamp.toDate === 'function') {
            ts = data.timestamp.toDate();
          } else if (data.timestamp instanceof Date) {
            ts = data.timestamp;
          }
        }
        return {
          id: docSnap.id,
          ...data,
          timestamp: ts
        } as Message;
      });

      setMessages(prev => {
        const existingIds = new Set(msgs.map(m => m.id));
        const pendingOptimistic = prev.filter(m => 
          m.id?.endsWith('-optimistic') && 
          !msgs.some(real => real.content === m.content && real.role === m.role)
        );
        
        return [...msgs, ...pendingOptimistic].sort((a, b) => {
          const t1 = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
          const t2 = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
          return t1 - t2;
        });
      });
    }, (error) => {
      console.error("Messages Subscription Error:", error);
      // Fallback for missing index
      if (error.message.includes('requires an index')) {
        const fallbackQuery = query(
          collection(db, 'conversations', activeConversationId, 'messages'),
          where('userId', '==', userId)
        );
        onSnapshot(fallbackQuery, (fallbackSnap) => {
          const fallbackMsgs = fallbackSnap.docs.map(docSnap => {
             const data = docSnap.data({ serverTimestamps: 'estimate' });
             let ts = new Date();
             if (data.timestamp) {
               if (typeof data.timestamp.toDate === 'function') {
                 ts = data.timestamp.toDate();
               } else if (data.timestamp instanceof Date) {
                 ts = data.timestamp;
               }
             }
             return { id: docSnap.id, ...data, timestamp: ts } as Message;
          }).sort((a, b) => {
             const t1 = a.timestamp instanceof Date ? a.timestamp.getTime() : 0;
             const t2 = b.timestamp instanceof Date ? b.timestamp.getTime() : 0;
             return t1 - t2;
          });
          setMessages(fallbackMsgs);
        });
      }
    });

    return () => {
      unsubscribe();
      if (activeReaderRef.current) {
        activeReaderRef.current.cancel().catch(() => {});
        activeReaderRef.current = null;
      }
    };
  }, [activeConversationId, userId]);

  const sendMessage = useCallback(async (content: string, createConversation: (title?: string) => Promise<string | null>) => {
    if (!content.trim() || isLoading || !userId) return;

    const userMessage = content.trim();
    setIsLoading(true);

    const optimisticId = 'msg-' + Date.now() + '-user-optimistic';
    const localUserMsg: Message = {
      id: optimisticId,
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, localUserMsg]);
    
    let currentConvId = activeConversationId;
    
    try {
      if (!currentConvId) {
        currentConvId = await createConversation(userMessage.slice(0, 30));
        if (!currentConvId) throw new Error("Failed to create conversation");
      }

      const msgColl = collection(db, 'conversations', currentConvId, 'messages');
      await addDoc(msgColl, {
        role: 'user',
        content: userMessage,
        timestamp: new Date(), 
        userId: userId
      });

      if (activeReaderRef.current) {
        try { await activeReaderRef.current.cancel(); } catch(e) {}
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); 

      // Remove optimistic messages from history to send
      const historyForApi = messages
        .filter(m => !m.id?.endsWith('-optimistic'))
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ message: userMessage, history: historyForApi })
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch response: ${response.status}`);
      }

      const streamingId = 'streaming-' + Date.now();
      setStreamingContent({ id: streamingId, content: '' });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to start stream");
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
              setStreamingContent({ id: streamingId, content: assistantText });
            } else if (data.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            // Ignore parse errors for partial chunks, handled by robust buffering
            console.warn("Parse error on chunk:", raw);
          }
        }
      }

      activeReaderRef.current = null;
      setStreamingContent(null);

      if (assistantText.trim()) {
        await Promise.all([
          addDoc(msgColl, {
            role: 'assistant',
            content: assistantText,
            timestamp: new Date(),
            userId: userId
          }),
          updateDoc(doc(db, 'conversations', currentConvId), {
            lastUpdatedAt: serverTimestamp()
          })
        ]);
      }

    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, {
        id: 'err-' + Date.now(),
        role: 'assistant',
        content: `**Error:** ${error.message || "Failed to get a response."}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      setStreamingContent(null);
      activeReaderRef.current = null;
    }
  }, [activeConversationId, messages, userId]);

  return {
    messages,
    isLoading,
    streamingContent,
    sendMessage
  };
}
