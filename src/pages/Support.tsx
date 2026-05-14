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
import { MessageCircle, Phone, Mail, Clock, CheckCircle, AlertCircle, Send } from "lucide-react";
import { toast } from "sonner";

export default function Support() {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("medium");

  const myTickets = trpc.support.listMine.useQuery();
  const createTicket = trpc.support.create.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال التذكرة بنجاح!");
      setSubject(""); setMessage(""); setPriority("medium");
      myTickets.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "حدث خطأ أثناء الإرسال");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    createTicket.mutate({ subject, message, priority: priority as any });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/support" title="مركز الدعم - SmartSpend AI" />

      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">مركز الدعم</h1>
        <p className="text-muted-foreground mb-8">نحن هنا للمساعدة! تواصل معنا أو شوف الأسئلة الشائعة.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <ContactCard icon={<Phone className="w-6 h-6" />} title="تليفون" value="0100-123-4567" color="green" />
          <ContactCard icon={<Mail className="w-6 h-6" />} title="إيميل" value="support@smartspend.app" color="blue" />
          <ContactCard icon={<Clock className="w-6 h-6" />} title="مواعيد العمل" value="طول اليوم" color="purple" />
        </div>

        <Tabs defaultValue="new">
          <TabsList className="mb-6">
            <TabsTrigger value="new"><Send className="w-4 h-4 ml-1" /> تذكرة جديدة</TabsTrigger>
            <TabsTrigger value="history"><MessageCircle className="w-4 h-4 ml-1" /> تذاكري</TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            <Card>
              <CardHeader><CardTitle>إرسال تذكرة دعم</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">الموضوع</label>
                    <Input 
                      placeholder="مثال: مشكلة في تسجيل الدخول" 
                      value={subject} 
                      onChange={(e) => setSubject(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">الأولوية</label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
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
                    <label className="text-sm font-medium mb-2 block">الرسالة</label>
                    <Textarea 
                      placeholder="اشرح المشكلة بتاعتك بالتفصيل..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createTicket.isPending}>
                    {createTicket.isPending ? "جاري الإرسال..." : "إرسال التذكرة"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle>تذاكري السابقة</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {myTickets.data?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>مفيش تذاكر لسه. ابعت تذكرة لو محتاج مساعدة!</p>
                    </div>
                  )}
                  {myTickets.data?.map((t: any) => (
                    <div key={t.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold">{t.subject}</h4>
                        <div className="flex gap-2">
                          <Badge variant={t.status === "open" ? "default" : t.status === "resolved" ? "secondary" : "outline"}>
                            {t.status === "open" ? "مفتوحة" : t.status === "resolved" ? "محلولة" : t.status === "closed" ? "مغلقة" : "قيد التنفيذ"}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{t.message}</p>
                      {t.response && (
                        <div className="bg-primary/5 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-xs font-bold text-primary">رد الدعم</span>
                          </div>
                          <p className="text-sm">{t.response}</p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(t.createdAt).toLocaleString("ar-EG")}
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

function ContactCard({ icon, title, value, color }: { icon: React.ReactNode; title: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-500/10 text-green-600",
    blue: "bg-blue-500/10 text-blue-600",
    purple: "bg-purple-500/10 text-purple-600",
  };
  return (
    <Card className="text-center hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className={`w-12 h-12 rounded-xl ${colors[color]} flex items-center justify-center mx-auto mb-3`}>
          {icon}
        </div>
        <h3 className="font-bold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
