import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  LogOut, 
  X, 
  MessageSquare, 
  History, 
  Pencil, 
  LifeBuoy,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Logo } from './Logo';
import { Conversation } from '../types';

interface SidebarProps {
  user: any;
  conversations: Conversation[];
  loadingConversations: boolean;
  convError: Error | null;
  activeConversationId: string | null;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  startNewConversation: () => void;
  setActiveConversationId: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, newTitle: string) => void;
  handleLogout: () => void;
}

export function Sidebar({
  user,
  conversations,
  loadingConversations,
  convError,
  activeConversationId,
  sidebarOpen,
  setSidebarOpen,
  startNewConversation,
  setActiveConversationId,
  deleteConversation,
  renameConversation,
  handleLogout
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showSupportMail, setShowSupportMail] = useState(false);

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

  const onRenameSubmit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    renameConversation(id, editTitle);
    setEditingId(null);
  };

  return (
    <>
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
                  <form onSubmit={(e) => onRenameSubmit(e, conv.id)} className="flex-1">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={(e) => onRenameSubmit(e as any, conv.id)}
                      className="bg-transparent border-none text-xs font-semibold w-full focus:outline-none p-0 text-white"
                    />
                  </form>
                ) : (
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-semibold truncate tracking-tight">{conv.title}</span>
                    <span className="text-[7px] font-bold text-white/20 uppercase tracking-tighter">
                      {formatDistance(conv.lastUpdatedAt as Date)}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="p-1.5 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          {conversations.length === 0 && !loadingConversations && !convError && (
            <div className="p-8 text-center space-y-4">
               <div className="w-12 h-12 rounded-full border border-white/5 flex items-center justify-center mx-auto opacity-20">
                 <History className="w-5 h-5" />
               </div>
               <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold">No threads yet</p>
            </div>
          )}
        </nav>

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
    </>
  );
}
