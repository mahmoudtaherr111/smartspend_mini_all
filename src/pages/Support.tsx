import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Phone, Mail, Clock, CheckCircle, Send, Headphones } from "lucide-react";
import { toast } from "sonner";

export default function Support() {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("medium");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");

  const myTickets = trpc.support.listMine.useQuery();
  const createTicket = trpc.support.create.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال التذكرة بنجاح!");
      setSubject("");
      setMessage("");
      setPriority("medium");
      myTickets.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "حدث خطأ أثناء الإرسال");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPhone = phone.replace(/\s/g, "");
    if (!subject.trim() || !message.trim() || normalizedPhone.length < 10) {
      toast.error("رقم الموبايل مطلوب (10 أرقام على الأقل)");
      return;
    }
    createTicket.mutate({
      subject,
      message,
      priority: priority as "low" | "medium" | "high" | "urgent",
      contactPhone: normalizedPhone,
      contactEmail: email.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-nav-safe md:p-8 md:pb-8" dir="rtl">
      <SEOMeta path="/support" title="مركز الدعم - SmartSpend AI" />

      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">مركز الدعم</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            فريقنا يرد خلال <strong>24 ساعة</strong> في أيام العمل. اترك رقم موبايلك للمتابعة السريعة.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ContactCard icon={<Phone className="w-6 h-6" />} title="تليفون" value="0100-123-4567" color="green" />
          <ContactCard icon={<Mail className="w-6 h-6" />} title="إيميل" value="support@smartspend.app" color="blue" />
          <ContactCard icon={<Clock className="w-6 h-6" />} title="الرد المتوقع" value="خلال 24 ساعة" color="purple" />
        </div>

        <Tabs defaultValue="new" className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-auto min-h-[44px] p-1">
            <TabsTrigger value="new" className="tap-target gap-1 text-xs sm:text-sm">
              <Send className="w-4 h-4 shrink-0" />
              تذكرة جديدة
            </TabsTrigger>
            <TabsTrigger value="history" className="tap-target gap-1 text-xs sm:text-sm">
              <MessageCircle className="w-4 h-4 shrink-0" />
              تذاكري
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-emerald-600" />
                  إرسال تذكرة دعم
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 dark:border-emerald-900 px-3 py-2.5 text-sm text-emerald-900 dark:text-emerald-100">
                    سنرد على تذكرتك خلال <strong>24 ساعة</strong> عبر الموبايل أو الإيميل إن وُجد.
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="support-phone">
                      رقم الموبايل <span className="text-destructive">*</span>
                    </label>
                    <Input
                      id="support-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="01xxxxxxxxx"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="min-h-[44px] text-base"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="support-email">
                      البريد الإلكتروني (اختياري)
                    </label>
                    <Input
                      id="support-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="min-h-[44px] text-base"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="support-subject">
                      الموضوع
                    </label>
                    <Input
                      id="support-subject"
                      placeholder="مثال: مشكلة في تسجيل الدخول"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="min-h-[44px] text-base"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">الأولوية</label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">منخفضة</SelectItem>
                        <SelectItem value="medium">متوسطة</SelectItem>
                        <SelectItem value="high">عالية</SelectItem>
                        <SelectItem value="urgent">عاجلة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="support-message">
                      الرسالة
                    </label>
                    <Textarea
                      id="support-message"
                      placeholder="اشرح المشكلة بتاعتك بالتفصيل..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      className="min-h-[120px] text-base resize-y"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full min-h-[48px] text-base active-press"
                    disabled={createTicket.isPending}
                  >
                    {createTicket.isPending ? "جاري الإرسال..." : "إرسال التذكرة"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">تذاكري السابقة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {myTickets.data?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>مفيش تذاكر لسه. ابعت تذكرة لو محتاج مساعدة!</p>
                    </div>
                  )}
                  {myTickets.data?.map((t) => (
                    <div key={t.id} className="border rounded-xl p-4 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="font-bold text-sm sm:text-base break-words">{t.subject}</h4>
                        <Badge
                          variant={
                            t.status === "open" ? "default" : t.status === "resolved" ? "secondary" : "outline"
                          }
                          className="w-fit"
                        >
                          {t.status === "open"
                            ? "مفتوحة"
                            : t.status === "resolved"
                              ? "محلولة"
                              : t.status === "closed"
                                ? "مغلقة"
                                : "قيد التنفيذ"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{t.message}</p>
                      {t.response && (
                        <div className="bg-primary/5 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="text-xs font-bold text-primary">رد الدعم</span>
                          </div>
                          <p className="text-sm break-words">{t.response}</p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t.createdAt ? new Date(t.createdAt).toLocaleString("ar-EG") : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  value,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "bg-green-500/10 text-green-600",
    blue: "bg-blue-500/10 text-blue-600",
    purple: "bg-purple-500/10 text-purple-600",
  };
  return (
    <Card className="text-center hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-6">
        <div
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${colors[color]} flex items-center justify-center mx-auto mb-2 sm:mb-3`}
        >
          {icon}
        </div>
        <h3 className="font-bold mb-1 text-sm sm:text-base">{title}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground break-all">{value}</p>
      </CardContent>
    </Card>
  );
}
