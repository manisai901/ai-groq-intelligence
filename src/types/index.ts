import { Timestamp } from 'firebase/firestore';

export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date | Timestamp;
  fileUrl?: string;
  fileName?: string;
  userId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  userId: string;
  createdAt: Date | Timestamp;
  lastUpdatedAt: Date | Timestamp;
}
