import React, { useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { User, Sparkles, FileText, Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { Timestamp } from 'firebase/firestore';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date | Timestamp;
  fileUrl?: string;
  fileName?: string;
}

export function MessageBubble({ message }: { message: Message }) {
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
             {isUser ? <User className="w-3 h-3 text-white/50" /> : <Sparkles className="w-3 h-3 text-indigo-400" />}
           </div>
           <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
             {isUser ? 'Human Subject' : 'Neural Core'}
           </span>
        </div>

        <div className={cn(
          "px-3 py-2.5 rounded-lg shadow-xl relative overflow-hidden border text-[11px] font-medium leading-relaxed",
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
          <div className="prose prose-sm prose-invert prose-indigo max-w-none text-white/90">
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
