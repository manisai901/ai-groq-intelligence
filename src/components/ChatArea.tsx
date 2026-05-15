import React, { useRef, useEffect } from 'react';
import { Menu, Sparkles, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SuggestionCard } from './SuggestionCard';
import { Message } from '../types';
import { motion } from 'motion/react';

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  streamingContent: { id: string; content: string } | null;
  configStatus: { hasKey: boolean; checked: boolean };
  setSidebarOpen: (open: boolean) => void;
  sendMessage: (content: string) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const SUGGESTIONS = [
  "Synthesize a weekly status report template.",
  "Optimize this React component for performance.",
  "Draft an enterprise security policy."
];

export function ChatArea({
  messages,
  isLoading,
  streamingContent,
  configStatus,
  setSidebarOpen,
  sendMessage,
  handleFileUpload,
  fileInputRef
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isLoading]);

  return (
    <main className="flex-1 flex flex-col min-w-0 relative z-10 p-2 sm:p-4 lg:p-8">
      <div className="flex-1 flex flex-col glass rounded-[1.5rem] sm:rounded-[3rem] border-white/[0.03] overflow-hidden relative shadow-2xl">
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
                configStatus.hasKey ? "bg-emerald-400 shadow-emerald-500/50" : "bg-red-400 shadow-red-500/50"
              )} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                {configStatus.hasKey ? 'Neural Link Active' : 'System Offline'}
              </span>
            </div>
          </div>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-50" />
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 sm:p-6 lg:p-8" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-12">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-indigo-500/20 blur-[60px] rounded-full" />
                <div className="w-24 h-24 sm:w-32 sm:h-32 glass-premium rounded-full flex items-center justify-center relative border border-white/10 shadow-2xl">
                  <Sparkles className="w-10 h-10 sm:w-14 sm:h-14 text-indigo-400" />
                </div>
              </motion.div>
              <div className="space-y-4">
                <h2 className="text-3xl sm:text-5xl font-display font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/40">
                  How can I assist you today?
                </h2>
                <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
                  Initiate a query or select a specialized synthesis protocol below.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                {SUGGESTIONS.map((s, i) => (
                  <SuggestionCard key={i} text={s} onClick={() => sendMessage(s)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full space-y-6 sm:space-y-8 pb-4">
              {messages.map((msg, idx) => (
                <MessageBubble key={msg.id || idx} message={msg as any} />
              ))}
              {isLoading && !streamingContent && (
                <div className="flex justify-start">
                  <div className="glass-premium rounded-2xl rounded-tl-sm p-4 text-white/50 text-sm flex flex-col gap-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Synthesizing</span>
                    </div>
                    <div className="flex gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              {streamingContent && (
                <MessageBubble 
                  key={streamingContent.id} 
                  message={{ 
                    role: 'assistant', 
                    content: streamingContent.content, 
                    timestamp: new Date() 
                  } as any} 
                />
              )}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 shrink-0 relative">
          <div className="absolute inset-x-0 bottom-full h-32 bg-gradient-to-t from-[#030303] to-transparent pointer-events-none" />
          <div className="max-w-3xl mx-auto relative z-10">
             <ChatInput 
                onSend={sendMessage} 
                disabled={isLoading} 
                onFileUpload={() => fileInputRef.current?.click()} 
             />
             <div className="mt-3 flex items-center justify-center gap-2 opacity-40">
               <ShieldCheck className="w-3 h-3 text-emerald-400" />
               <p className="text-[9px] text-center uppercase tracking-widest font-black">
                 Encrypted Enterprise Connection
               </p>
             </div>
             <input
               type="file"
               ref={fileInputRef}
               className="hidden"
               onChange={handleFileUpload}
               accept="image/*,.pdf,.doc,.docx,.txt"
             />
          </div>
        </div>
      </div>
    </main>
  );
}
