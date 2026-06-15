import { useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Sparkles, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { useHaptics } from "@/hooks/useHaptics";

const VOICES = [
  { id: "Aoede", label: "Olivia", gender: "أنثى" },
  { id: "Kore", label: "Sarah", gender: "أنثى" },
  { id: "Charon", label: "James", gender: "ذكر" },
] as const;

export default function AIVoiceCall() {
  const [selectedVoice, setSelectedVoice] = useState("Aoede");
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const { mediumTap } = useHaptics();

  const {
    status,
    errorMessage,
    isMuted,
    elapsedSeconds,
    aiText,
    startCall,
    endCall,
    toggleMute,
  } = useVoiceCall();

  const isIdle = status === "idle" || status === "ended" || status === "error";
  const isConnecting = status === "connecting";
  const isConnected = status === "connected" || status === "warning";

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const currentVoice = VOICES.find((v) => v.id === selectedVoice) || VOICES[0];

  const handleStartCall = () => {
    mediumTap();
    startCall(selectedVoice);
  };

  const handleEndCall = () => {
    mediumTap();
    endCall();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-6 space-y-6">
      {/* ── Idle State ── */}
      {isIdle && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center space-y-6 w-full max-w-sm"
        >
          {/* Avatar */}
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-2xl">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-4 border-background flex items-center justify-center">
              <Phone className="w-3 h-3 text-white" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold">مستشارك المالي الصوتي</h3>
            <p className="text-sm text-muted-foreground mt-1">
              اتكلم مع سمارت وناقش مصاريفك بالصوت
            </p>
          </div>

          {/* Error display */}
          {status === "error" && errorMessage && (
            <div className="w-full p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm text-center">
              {errorMessage}
            </div>
          )}

          {/* Voice Selector */}
          <div className="w-full">
            <button
              type="button"
              onClick={() => setShowVoiceSelector(!showVoiceSelector)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30 text-sm"
            >
              <span>الصوت: {currentVoice.label} ({currentVoice.gender})</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", showVoiceSelector && "rotate-180")} />
            </button>
            <AnimatePresence>
              {showVoiceSelector && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-1"
                >
                  <div className="space-y-1 p-1">
                    {VOICES.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => {
                          setSelectedVoice(voice.id);
                          setShowVoiceSelector(false);
                        }}
                        className={cn(
                          "w-full text-start p-2.5 rounded-lg text-sm transition-colors",
                          selectedVoice === voice.id
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                            : "hover:bg-muted",
                        )}
                      >
                        {voice.label} ({voice.gender})
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Start Call Button */}
          <Button
            onClick={handleStartCall}
            size="lg"
            className="tap-target active-press w-full h-14 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all"
          >
            <Phone className="w-5 h-5 ml-2" />
            ابدأ المكالمة
          </Button>
        </motion.div>
      )}

      {/* ── Connecting State ── */}
      {isConnecting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center space-y-4"
        >
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center animate-pulse">
              <Sparkles className="w-12 h-12 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">جاري الاتصال...</p>
        </motion.div>
      )}

      {/* ── Connected State ── */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center space-y-6 w-full max-w-sm"
        >
          {/* Status + Timer */}
          <div className="flex items-center gap-2 text-sm">
            <span className={cn(
              "w-2 h-2 rounded-full",
              status === "warning" ? "bg-amber-500 animate-pulse" : "bg-emerald-500",
            )} />
            <span className="text-muted-foreground">
              {status === "warning" ? "المكالمة قاربت تخلص" : "متصل"}
            </span>
            <span className="font-mono text-foreground font-bold">{formatTime(elapsedSeconds)}</span>
          </div>

          {/* Animated Avatar with Waveform */}
          <div className="relative flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-2xl">
              <Sparkles className="w-10 h-10 text-white" />
            </div>

            {/* Voice waveform */}
            <div className="voice-wave text-emerald-500 mt-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <span key={i} />
              ))}
            </div>
          </div>

          {/* Subtitle Area */}
          {showSubtitles && aiText && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full p-4 rounded-xl glass-card text-sm leading-relaxed text-center selectable-text max-h-32 overflow-y-auto"
            >
              {aiText}
            </motion.div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={cn(
                "tap-target h-12 w-12 rounded-full transition-colors",
                showSubtitles && "bg-indigo-500/10 border-indigo-500/30 text-indigo-600",
              )}
              title={showSubtitles ? "إخفاء النص" : "عرض النص"}
            >
              <span className="text-xs font-bold">CC</span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleMute}
              className={cn(
                "tap-target h-12 w-12 rounded-full transition-colors",
                isMuted && "bg-red-500/10 border-red-500/30 text-red-600",
              )}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>

            <Button
              size="icon"
              onClick={handleEndCall}
              className="tap-target active-press h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
