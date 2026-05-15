import React from 'react';
import { Sparkles } from 'lucide-react';

export function SuggestionCard({ title, description, onClick }: { title: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/50 hover:bg-white/[0.04] text-left transition-all group relative overflow-hidden active:scale-[0.98]"
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.1] transition-opacity group-hover:scale-125 duration-700">
        <Sparkles className="w-10 h-10" />
      </div>
      <h4 className="text-[9px] font-black text-indigo-400 mb-1.5 uppercase tracking-[0.2em]">{title}</h4>
      <p className="text-[12px] text-white/40 font-bold leading-tight group-hover:text-white/80 transition-all">{description}</p>
    </button>
  );
}
