import React from 'react';
import { Sparkles } from 'lucide-react';

export function SuggestionCard({ title, description, onClick }: { title: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="p-4 rounded-xl bg-white/[0.015] border border-white/5 hover:border-indigo-500/40 hover:bg-white/[0.03] text-left transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.02] group-hover:opacity-[0.08] transition-opacity">
        <Sparkles className="w-10 h-10" />
      </div>
      <h4 className="text-[8px] font-black text-indigo-400 mb-1 uppercase tracking-widest">{title}</h4>
      <p className="text-[11px] text-white/30 font-medium leading-relaxed group-hover:text-white/60 transition-all">{description}</p>
    </button>
  );
}
