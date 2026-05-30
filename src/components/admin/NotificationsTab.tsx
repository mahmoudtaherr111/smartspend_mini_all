import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Bell, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../providers/trpc";

export function NotificationsTab() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<"all" | "free" | "pro" | "specific">(
    "all",
  );

  const sendPushNotification = trpc.admin.sendPushNotification.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setTitle("");
      setBody("");
    },
    onError: (err) => {
      toast.error(`حدث خطأ: ${err.message}`);
    },
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      toast.error("يرجى إدخال عنوان ومحتوى الإشعار");
      return;
    }

    sendPushNotification.mutate({
      title,
      body,
      target,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-900/20 dark:to-indigo-900/20 border-b border-white/20 dark:border-slate-800 p-6">
          <CardTitle className="flex items-center gap-2 text-sky-700 dark:text-sky-400">
            <Bell className="w-5 h-5" />
            إرسال إشعارات (Push Notifications)
          </CardTitle>
          <CardDescription className="text-sky-600/70 dark:text-sky-300/70">
            أرسل إشعارات فورية تظهر على هواتف المستخدمين كالتطبيقات الأصلية.
          </CardDescription>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="grid gap-2">
            <Label>شريحة المستخدمين</Label>
            <Select value={target} onValueChange={(val: any) => setTarget(val)}>
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue placeholder="اختر الشريحة..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المستخدمين</SelectItem>
                <SelectItem value="free">المستخدمين المجانيين فقط</SelectItem>
                <SelectItem value="pro">مستخدمي البرو فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>عنوان الإشعار</Label>
            <Input
              placeholder="مثال: تحديث جديد متاح! 🚀"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="max-w-md"
            />
          </div>

          <div className="grid gap-2">
            <Label>محتوى الإشعار</Label>
            <Textarea
              placeholder="اكتب رسالتك هنا..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="max-w-md resize-none"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={sendPushNotification.isPending}
            className="gap-2 bg-sky-600 hover:bg-sky-700 text-white w-full sm:w-auto"
          >
            <Send className="w-4 h-4" />
            {sendPushNotification.isPending
              ? "جاري الإرسال..."
              : "إرسال الإشعار الآن"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
