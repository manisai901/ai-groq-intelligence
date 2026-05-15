import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Conversation } from '../types';

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Use orderBy to sort server-side, needs composite index in Firestore!
    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      orderBy('lastUpdatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const convos = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data({ serverTimestamps: 'estimate' });
        let lastUpdate: Date;
        if (data.lastUpdatedAt && typeof data.lastUpdatedAt.toDate === 'function') {
          lastUpdate = data.lastUpdatedAt.toDate();
        } else {
          lastUpdate = new Date(data.lastUpdatedAt || Date.now());
        }
        return {
          id: docSnapshot.id,
          ...data,
          lastUpdatedAt: lastUpdate
        } as Conversation;
      });
      setConversations(convos);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Conversations fetch error:", err);
      // Fallback for missing index: query without orderBy, sort client-side
      if (err.message.includes('requires an index')) {
        console.warn("Falling back to client-side sorting until index is built");
        const fallbackQuery = query(
          collection(db, 'conversations'),
          where('userId', '==', userId)
        );
        onSnapshot(fallbackQuery, (fallbackSnap) => {
          const fallbackConvos = fallbackSnap.docs.map(docSnapshot => {
            const data = docSnapshot.data({ serverTimestamps: 'estimate' });
            let lastUpdate: Date;
            if (data.lastUpdatedAt && typeof data.lastUpdatedAt.toDate === 'function') {
              lastUpdate = data.lastUpdatedAt.toDate();
            } else {
              lastUpdate = new Date(data.lastUpdatedAt || Date.now());
            }
            return {
              id: docSnapshot.id,
              ...data,
              lastUpdatedAt: lastUpdate
            } as Conversation;
          }).sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime());
          
          setConversations(fallbackConvos);
          setLoading(false);
          setError(null);
        });
      } else {
        setError(err);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  const createConversation = useCallback(async (title: string = "New Conversation") => {
    if (!userId) return null;
    try {
      const newConvRef = await addDoc(collection(db, 'conversations'), {
        userId,
        title,
        createdAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp()
      });
      return newConvRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'conversations');
      return null;
    }
  }, [userId]);

  const removeConversation = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'conversations', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `conversations/${id}`);
    }
  }, []);

  const renameConversation = useCallback(async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'conversations', id), {
        title: newTitle.trim(),
        lastUpdatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `conversations/${id}`);
    }
  }, []);

  return {
    conversations,
    loading,
    error,
    createConversation,
    removeConversation,
    renameConversation
  };
}
