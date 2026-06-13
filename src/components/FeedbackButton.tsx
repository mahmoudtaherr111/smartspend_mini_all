import { useState } from "react";
import { MessageCircleHeart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const createTicket = trpc.support.create.useMutation({
    onSuccess: () => {
      toast.success("شكراً لرسالتك! رأيك بيهمنا جداً.");
      setOpen(false);
      setMessage("");
    },
    onError: (err) => {
      toast.error(err.message || "حدث خطأ أثناء الإرسال");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    createTicket.mutate({
      subject: "اقتراح / ملاحظة (Feedback)",
      message: message,
      priority: "low",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          className="fixed start-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:start-6 h-14 w-14 min-h-[56px] min-w-[56px] rounded-full shadow-2xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 active:scale-95 transition-transform z-40 text-white"
        >
          <MessageCircleHeart className="w-6 h-6" />
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>شاركنا رأيك 💡</DialogTitle>
          <DialogDescription>
            واجهت مشكلة؟ عندك اقتراح لميزة جديدة؟ احنا بنسمعك!
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <textarea
            placeholder="اكتب رسالتك هنا..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full min-h-[120px] resize-none border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 bg-transparent"
            required
            minLength={10}
          />
          <Button
            type="submit"
            className="w-full bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white"
            disabled={createTicket.isPending || message.length < 10}
          >
            {createTicket.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin ms-2" />
            ) : null}
            إرسال الملاحظة
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
