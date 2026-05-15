import React from 'react';
import { Sparkles } from 'lucide-react';

export function Logo({ hideVersion = false, onClick }: { hideVersion?: boolean, onClick?: () => void }) {
  return (
    <div className="flex items-center gap-2 group cursor-pointer select-none" onClick={onClick}>
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20 relative overflow-hidden group-hover:scale-105 transition-transform duration-500">
        <Sparkles className="w-3.5 h-3.5 text-white relative z-10" />
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex flex-col">
        <span className="font-display text-sm font-bold tracking-tighter text-white italic" style={{ fontFamily: 'Arial' }}>
          Mani AI
        </span>
        {!hideVersion && (
          <span className="text-[7px] font-black tracking-[0.4em] text-indigo-400 uppercase opacity-50">
            Persistent Neural Cloud
          </span>
        )}
      </div>
    </div>
  );
}
