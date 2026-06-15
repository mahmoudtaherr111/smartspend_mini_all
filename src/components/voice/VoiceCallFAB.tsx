import React, { useState } from "react";
import { Phone, Sparkles } from "lucide-react";
import { VoiceCallOverlay } from "./VoiceCallOverlay";
import { cn } from "@/lib/utils";

export function VoiceCallFAB() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 left-6 z-40 flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 active:scale-95 text-white rounded-full shadow-lg transition-all duration-300 group border border-white/10 hover:shadow-indigo-500/30",
          isOpen && "scale-0 pointer-events-none"
        )}
        style={{
          boxShadow: "0 0 15px rgba(99, 102, 241, 0.4)",
        }}
        title="اتصل بالمستشار المالي للذكاء الاصطناعي"
      >
        {/* Pulsing neon waves behind button */}
        <span className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping group-hover:animate-none pointer-events-none" />
        <span className="absolute inset-[-4px] rounded-full bg-purple-500/10 blur-sm animate-pulse pointer-events-none" />

        <div className="relative">
          <Phone className="w-6 h-6 transition-transform group-hover:rotate-12 duration-300" />
          <Sparkles className="w-3.5 h-3.5 absolute -top-1.5 -right-2 text-yellow-300 animate-bounce" />
        </div>
      </button>

      {/* Fullscreen Call Overlay */}
      {isOpen && (
        <VoiceCallOverlay onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
export default VoiceCallFAB;
