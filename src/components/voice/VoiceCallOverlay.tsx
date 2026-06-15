import React, { useEffect, useRef } from "react";
import { useVoiceCall, CallStatus } from "@/hooks/useVoiceCall";
import { Mic, MicOff, PhoneOff, Volume2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceCallOverlayProps {
  onClose: () => void;
}

export function VoiceCallOverlay({ onClose }: VoiceCallOverlayProps) {
  const {
    status,
    errorMessage,
    isMuted,
    elapsedSeconds,
    aiText,
    activeModel,
    startCall,
    endCall,
    toggleMute,
    inputAnalyser,
    outputAnalyser,
  } = useVoiceCall();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedVoice, setSelectedVoice] = React.useState("Aoede");
  const [showSubtitles, setShowSubtitles] = React.useState(true);

  // Automatically start call when overlay mounts
  useEffect(() => {
    startCall(selectedVoice);
    return () => {
      endCall();
    };
  }, []);

  const handleVoiceChange = (newVoice: string) => {
    setSelectedVoice(newVoice);
    if (status === "connected" || status === "connecting" || status === "warning") {
      endCall();
      setTimeout(() => {
        startCall(newVoice);
      }, 300);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Canvas visualizer loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set high resolution for canvas
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const inputBuffer = new Uint8Array(64);
    const outputBuffer = new Uint8Array(64);

    const draw = () => {
      animId = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // 1. Clear with trailing transparency for organic trail
      ctx.fillStyle = "rgba(10, 10, 26, 0.15)";
      ctx.fillRect(0, 0, w, h);

      const time = performance.now() * 0.003;

      // 2. Fetch amplitudes
      let inputMax = 0;
      let outputMax = 0;

      if (inputAnalyser && !isMuted) {
        inputAnalyser.getByteFrequencyData(inputBuffer);
        inputMax = inputBuffer.reduce((sum, val) => sum + val, 0) / inputBuffer.length;
      }

      if (outputAnalyser) {
        outputAnalyser.getByteFrequencyData(outputBuffer);
        outputMax = outputBuffer.reduce((sum, val) => sum + val, 0) / outputBuffer.length;
      }

      // Max values mapped to normalized floats
      const inputAmp = Math.min(1, inputMax / 100);
      const outputAmp = Math.min(1, outputMax / 100);

      const dpr = window.devicePixelRatio || 1;

      // Draw flowing horizontal center sine wave (glowing breathing line)
      ctx.shadowBlur = 10 * dpr;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
      ctx.shadowColor = "rgba(99, 102, 241, 0.2)";
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const amplitude = 15 + (inputAmp + outputAmp) * 45;
        const frequency = 0.008;
        const speed = time * 0.8;
        const y = cy + Math.sin(x * frequency + speed) * amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 3. Draw Cyberpunk Pulsing Rings
      // Outer neon glow
      ctx.shadowBlur = (20 + outputAmp * 30 + inputAmp * 20) * dpr;
      ctx.lineWidth = 2 * dpr;

      // AI Ring (Cyber Purple/Pink) - pulses when AI speaks, breathes gently when silent
      ctx.strokeStyle = "rgba(139, 92, 246, 0.8)";
      ctx.shadowColor = "rgba(139, 92, 246, 0.6)";
      ctx.beginPath();
      const aiRadiusBase = w * 0.18;
      const aiRadius = aiRadiusBase + (outputAmp * 70) + (outputAmp === 0 ? Math.sin(time * 0.7) * 4 : 0);
      ctx.arc(cx, cy, aiRadius, 0, Math.PI * 2);
      ctx.stroke();

      // User Ring (Teal/Emerald) - pulses when user speaks, breathes gently when silent
      ctx.strokeStyle = "rgba(20, 184, 166, 0.8)";
      ctx.shadowColor = "rgba(20, 184, 166, 0.6)";
      ctx.beginPath();
      const userRadiusBase = w * 0.15;
      const userRadius = userRadiusBase + (inputAmp * 50) + (inputAmp === 0 ? Math.cos(time * 0.7) * 3 : 0);
      ctx.arc(cx, cy, userRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 4. Draw Audio Waves Orbiting the Ring
      ctx.shadowBlur = 10 * dpr;
      
      // Draw outer audio spectrum bars or wave spikes
      const numPoints = 120;
      ctx.lineWidth = 3 * dpr;

      if (outputAmp > 0.02) {
        // AI Wave spikes
        ctx.strokeStyle = "rgba(236, 72, 153, 0.9)"; // Neon Pink
        ctx.shadowColor = "rgba(236, 72, 153, 0.7)";
        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const index = i % outputBuffer.length;
          const amplitude = outputBuffer[index] * 0.8;
          const r = aiRadius + amplitude;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      if (inputAmp > 0.02 && !isMuted) {
        // User Wave spikes
        ctx.strokeStyle = "rgba(16, 185, 129, 0.9)"; // Emerald
        ctx.shadowColor = "rgba(16, 185, 129, 0.7)";
        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const index = i % inputBuffer.length;
          const amplitude = inputBuffer[index] * 0.6;
          const r = userRadius - amplitude; // orbit slightly inside
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // 5. Central Glassmorphic Node
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(15, 15, 35, 0.85)";
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.12, 0, Math.PI * 2);
      ctx.stroke();
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [inputAnalyser, outputAnalyser, isMuted]);

  // Handle overlay exit
  const handleExit = () => {
    endCall();
    onClose();
  };

  const statusTexts: Record<CallStatus, string> = {
    idle: "جاري الاستعداد...",
    connecting: "جاري الاتصال بالمستشار المالي...",
    connected: "متصل بالذكاء الاصطناعي",
    warning: "انتبه: الوقت المسموح يقترب من الانتهاء",
    error: "حدث خطأ في الاتصال",
    ended: "انتهت المكالمة الصديقة",
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-2xl text-white select-none overflow-hidden" dir="rtl">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[150px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-purple-500/10 blur-[150px] animate-pulse pointer-events-none" />

      {/* Main Call UI Area */}
      <div className="relative flex flex-col items-center justify-between w-full h-full max-w-md px-6 py-12">
        
        {/* Header Section */}
        <div className="text-center space-y-3 pt-6 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5">
              <span className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                status === "connected" ? "bg-emerald-400" : status === "warning" ? "bg-amber-400" : "bg-indigo-400"
              )}></span>
              <span className={cn(
                "relative inline-flex rounded-full h-2.5 w-2.5",
                status === "connected" ? "bg-emerald-500" : status === "warning" ? "bg-amber-500" : "bg-indigo-500"
              )}></span>
            </span>
            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider font-sans">
              SmartSpend Financial Advisor
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white mt-1">
            المستشار المالي الذكي
          </h2>
          

          
          <p className={cn(
            "text-sm font-medium transition-all duration-300 mt-2",
            status === "connected" ? "text-slate-400" : status === "warning" ? "text-amber-400 font-bold" : status === "error" ? "text-rose-400" : "text-indigo-300"
          )}>
            {statusTexts[status]}
          </p>
        </div>

        {/* Waves Visualization Area */}
        <div className="relative flex-1 w-full flex items-center justify-center">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full max-h-[350px] cursor-default" />
          
          {/* Pulse Icon Overlay in center of ring */}
          <div className="z-10 flex flex-col items-center justify-center space-y-1">
            {status === "error" ? (
              <ShieldAlert className="w-12 h-12 text-rose-500 animate-bounce" />
            ) : (
              <Volume2 className={cn(
                "w-12 h-12 text-white/90 transition-all",
                status === "connected" && "animate-pulse"
              )} />
            )}
            {status === "connected" && (
              <span className="text-xl font-mono font-bold text-slate-200 mt-2">
                {formatTime(elapsedSeconds)}
              </span>
            )}
          </div>
        </div>

        {/* Subtitles Area (الترجمة الحية) */}
        {aiText && showSubtitles && (
          <div className="w-full max-w-sm px-5 py-4 bg-slate-900/60 border border-white/10 rounded-2xl backdrop-blur-xl shadow-lg z-10 text-center animate-fade-in max-h-[120px] overflow-y-auto mb-4 custom-scrollbar">
            <p className="text-sm text-slate-100 leading-relaxed font-sans font-medium select-text">
              {aiText}
            </p>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="w-full max-w-sm p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex flex-col gap-3 backdrop-blur-xl animate-bounce mb-4 z-10 text-right">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
              <p className="text-xs text-rose-200 leading-relaxed font-medium">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={() => {
                endCall();
                startCall();
              }}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all duration-200"
            >
              إعادة الاتصال (Reconnect)
            </button>
          </div>
        )}

        {/* Settings Bar (Voice Selector & Subtitles Toggle) */}
        <div className="flex items-center justify-between w-full max-w-sm px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md z-10 mb-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">صوت المستشار:</span>
            <select
              value={selectedVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 font-bold outline-none cursor-pointer focus:border-indigo-500 transition-all font-sans"
            >
              <option value="Aoede">Olivia (Female)</option>
              <option value="Kore">Sarah (Female)</option>
              <option value="Charon">James (Male)</option>
            </select>
          </div>
          
          <button
            onClick={() => setShowSubtitles((p) => !p)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold transition-all duration-200 font-sans",
              showSubtitles
                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30"
                : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            )}
            title={showSubtitles ? "إخفاء النص" : "عرض النص"}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{showSubtitles ? "إخفاء النص" : "عرض النص"}</span>
          </button>
        </div>

        {/* Control Buttons Bar */}
        <div className="flex items-center justify-center gap-6 z-10 w-full">
          {/* Mute Button */}
          <button
            onClick={toggleMute}
            disabled={status !== "connected"}
            className={cn(
              "flex items-center justify-center w-14 h-14 rounded-full border transition-all duration-300 shadow-md",
              isMuted
                ? "bg-rose-600/30 border-rose-500/40 text-rose-400 hover:bg-rose-600/40"
                : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            )}
            title={isMuted ? "إلغاء الكتم" : "كتم الميكروفون"}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* End Call Button */}
          <button
            onClick={handleExit}
            className="flex items-center justify-center w-20 h-20 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-full transition-all duration-300 shadow-lg shadow-rose-950/50 hover:shadow-rose-600/30 border border-rose-500/30 animate-pulse"
            title="إنهاء المكالمة"
          >
            <PhoneOff className="w-8 h-8" />
          </button>
        </div>

      </div>
    </div>
  );
}
