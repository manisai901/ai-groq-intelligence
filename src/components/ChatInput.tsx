import React, { useRef } from 'react';
import { Mic, MicOff, Send, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  isLoading: boolean;
  isListening: boolean;
  toggleListening: () => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleClearInput: () => void;
  charLimit?: number;
}

export function ChatInput({
  input,
  setInput,
  isLoading,
  isListening,
  toggleListening,
  handleSubmit,
  handleClearInput,
  charLimit = 1000
}: ChatInputProps) {
  const isOverLimit = input.length > charLimit;

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6 md:px-16 bg-gradient-to-t from-[#030303] via-[#030303]/80 to-transparent">
      <div className="max-w-3xl mx-auto relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-xl sm:rounded-2xl blur-xl opacity-10 group-focus-within:opacity-20 transition-all duration-700" />
        <form 
          onSubmit={handleSubmit} 
          className="relative flex items-center gap-2 bg-[#0a0a0b]/90 border border-white/10 rounded-lg sm:rounded-xl p-1 sm:p-1.5 focus-within:border-indigo-500/40 transition-all shadow-2xl"
        >
          <div className="flex-1 relative flex items-center min-w-0">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              rows={1}
              placeholder="Ask Mani..."
              className="w-full bg-transparent border-none py-2 px-1.5 sm:px-0 text-[13px] focus:outline-none focus:ring-0 text-white placeholder:text-white/10 font-bold resize-none min-h-[36px] max-h-32 scrollbar-hide flex items-center"
              style={{ height: 'auto', minHeight: '36px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            
            {input && (
              <button 
                type="button" 
                onClick={handleClearInput}
                className="p-1 px-2 text-white/20 hover:text-white/60 transition-colors"
                title="Clear input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <div className={cn(
              "hidden sm:block text-[9px] font-mono whitespace-nowrap ml-1",
              isOverLimit ? "text-red-400" : "text-white/5"
            )}>
              {input.length}/{charLimit}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleListening}
              className={cn(
                "flex p-2 sm:p-2.5 rounded-xl transition-all duration-300",
                isListening 
                  ? "bg-red-500/20 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]" 
                  : "text-white/20 hover:text-indigo-400 hover:bg-white/5"
              )}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button 
              disabled={isLoading || !input.trim() || isOverLimit}
              type="submit" 
              className={cn(
                "h-9 sm:h-10 w-10 sm:w-12 rounded-lg bg-white text-black hover:bg-indigo-500 hover:text-white transition-all active:scale-95 flex items-center justify-center shrink-0 shadow-lg",
                (isLoading || !input.trim() || isOverLimit) ? "opacity-10 cursor-not-allowed" : "cursor-pointer"
              )}
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
