import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

export function Logo({ hideVersion = false, onClick, enterprise = false }: { hideVersion?: boolean, onClick?: () => void, enterprise?: boolean }) {
  return (
    <div className="flex items-center gap-3 group cursor-pointer select-none" onClick={onClick}>
      <div className="relative">
        <div className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xl relative z-10 group-hover:scale-110 transition-all duration-700 ease-out",
          enterprise ? "bg-gradient-to-br from-indigo-600 via-indigo-700 to-black shadow-indigo-500/10 border border-indigo-500/20" : "bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-800 shadow-indigo-500/20"
        )}>
          <Sparkles className={cn("w-4 h-4 text-white relative z-10", enterprise && "text-indigo-200")} />
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
        </div>
        <div className="absolute -inset-1 bg-indigo-500/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-all duration-1000 group-hover:animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="font-display text-base font-black tracking-tighter text-white italic leading-none flex items-center gap-2">
          MANI AI
          {enterprise && <span className="text-[7px] not-italic font-black bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20 tracking-widest uppercase">Enterprise</span>}
        </span>
        {!hideVersion && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[7px] font-black tracking-[0.4em] text-indigo-400 uppercase opacity-60">
              Nexus Neural Cloud V3.5
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
