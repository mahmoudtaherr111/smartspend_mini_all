import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, Trash2, Plus, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { useHaptics } from "@/hooks/useHaptics";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export default function AIChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [isTyping, setIsTyping] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { lightTap } = useHaptics();

  // tRPC mutations & queries
  const sendMessage = trpc.chat.sendMessage.useMutation();
  const quickActions = trpc.chat.getQuickActions.useQuery(undefined, {
    staleTime: 60_000 * 10,
  });
  const conversations = trpc.chat.getConversations.useQuery(undefined, {
    staleTime: 30_000,
  });
  const clearConversation = trpc.chat.clearConversation.useMutation();

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Detect scroll position for "scroll to bottom" button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distanceFromBottom > 100);
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Send message handler
  const handleSend = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || sendMessage.isPending) return;

    lightTap();
    setInput("");

    // Add user message immediately
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const result = await sendMessage.mutateAsync({
        message: messageText,
        conversationId,
      });

      // Set conversation ID for future messages
      if (!conversationId && result.conversationId) {
        setConversationId(result.conversationId);
      }

      // Add AI response
      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: result.response,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: any) {
      const errMsg = error?.message || "حصل مشكلة. جرب تاني.";
      toast.error(errMsg);
      // Remove the user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setIsTyping(false);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // New conversation
  const handleNewConversation = () => {
    lightTap();
    setMessages([]);
    setConversationId(undefined);
  };

  // Clear conversation
  const handleClear = async () => {
    if (!conversationId) {
      handleNewConversation();
      return;
    }
    try {
      await clearConversation.mutateAsync({ conversationId });
      handleNewConversation();
      toast.success("تم مسح المحادثة");
    } catch {
      toast.error("فشل مسح المحادثة");
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chat header bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">سمارت</p>
            <p className="text-[10px] text-emerald-500 font-medium">● متصل</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={handleNewConversation}
            title="محادثة جديدة"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={handleClear}
            title="مسح المحادثة"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto chat-scroll px-4 py-3 space-y-3"
      >
        {/* Empty state */}
        {isEmpty && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4 shadow-lg"
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>
            <h3 className="text-base font-bold mb-1">أهلاً! أنا سمارت 👋</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              مستشارك المالي الذكي. اسألني أي حاجة عن مصاريفك!
            </p>

            {/* Quick actions */}
            {quickActions.data && (
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                {quickActions.data.map((action, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    type="button"
                    onClick={() => handleSend(action.prompt)}
                    className="tap-target active-press text-start p-3 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 transition-colors text-xs font-medium"
                  >
                    {action.label}
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-start" : "justify-end",
              )}
            >
              <div
                className={
                  msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
                }
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap selectable-text">
                  {msg.content}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end"
          >
            <div className="chat-bubble-ai">
              <div className="typing-dots text-indigo-500">
                <span />
                <span />
                <span />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-8 h-8 rounded-full bg-background border border-border shadow-lg flex items-center justify-center"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-lg px-3 py-2 pb-safe">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="اكتب رسالتك..."
              rows={1}
              className="w-full resize-none rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all max-h-32"
              style={{ minHeight: "44px" }}
              disabled={sendMessage.isPending}
            />
          </div>
          <Button
            type="button"
            size="icon"
            onClick={() => handleSend()}
            disabled={!input.trim() || sendMessage.isPending}
            className={cn(
              "tap-target active-press shrink-0 h-11 w-11 rounded-xl transition-all duration-200",
              input.trim()
                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md hover:shadow-lg"
                : "bg-muted text-muted-foreground",
            )}
          >
            {sendMessage.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 rtl:rotate-180" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
