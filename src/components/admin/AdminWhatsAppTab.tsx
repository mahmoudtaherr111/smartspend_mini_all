import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageCircle,
  QrCode,
  Power,
  PowerOff,
  Send,
  Users,
  RefreshCw,
  Phone,
  Ban,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function AdminWhatsAppTab() {
  const [directPhone, setDirectPhone] = useState("");
  const [directMessage, setDirectMessage] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal states for user-specific message popup
  const [messageUser, setMessageUser] = useState<any>(null);
  const [messageChannel, setMessageChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [messageText, setMessageText] = useState("");

  const utils = trpc.useUtils();

  // Queries
  const {
    data: statusData,
    isLoading: isStatusLoading,
    refetch: refetchStatus,
  } = trpc.adminWhatsapp.getStatus.useQuery(undefined, {
    refetchInterval: 3000, // Poll every 3 seconds to get QR or status updates
  });

  const { data: settingsData, refetch: refetchSettings } = trpc.adminWhatsapp.getSettings.useQuery();

  const { data: usersData, isLoading: isUsersLoading } =
    trpc.adminWhatsapp.getUsers.useQuery();

  // Mutations
  const startService = trpc.adminWhatsapp.startService.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const stopService = trpc.adminWhatsapp.stopService.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const sendDirect = trpc.adminWhatsapp.sendDirectMessage.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setDirectPhone("");
      setDirectMessage("");
      setMessageUser(null);
      setMessageText("");
    },
    onError: (err) => toast.error(err.message),
  });

  const broadcast = trpc.adminWhatsapp.broadcastMessage.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      setBroadcastMessage("");
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const clearQueue = trpc.adminWhatsapp.clearQueue.useMutation({
    onSuccess: (res) => {
      toast.success(res.message);
      refetchStatus();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleOtpMutation = trpc.adminWhatsapp.toggleOtpVerification.useMutation({
    onSuccess: (res) => {
      toast.success("تم تحديث الإعدادات بنجاح");
      refetchSettings();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-white/50 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <MessageCircle className="w-8 h-8 text-green-500" />
            إدارة الواتساب 💬
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            تحكم كامل في خدمة المراسلة عبر الواتساب (الإرسال الفردي والجماعي).
          </p>
        </div>
        <div>
          {statusData?.status === "connected" ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-sm py-1.5 px-4 rounded-full">
              متصل بالخدمة
            </Badge>
          ) : statusData?.status === "qr" ? (
            <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-sm py-1.5 px-4 rounded-full">
              بانتظار مسح الكود
            </Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-sm py-1.5 px-4 rounded-full">
              غير متصل
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* --- بطاقة حالة الاتصال --- */}
        <Card className="shadow-sm rounded-3xl border-white/50 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Power className="w-5 h-5" />
              محرك الواتساب
            </CardTitle>
            <CardDescription>تشغيل وإيقاف الاتصال بالسيرفر</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => startService.mutate()}
                disabled={
                  startService.isPending || statusData?.status === "connected"
                }
                className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl"
              >
                {startService.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin ms-2" />
                ) : (
                  <Power className="w-4 h-4 ms-2" />
                )}
                تشغيل
              </Button>
              <Button
                onClick={() => stopService.mutate()}
                disabled={
                  stopService.isPending || statusData?.status === "disconnected"
                }
                variant="destructive"
                className="w-full rounded-xl"
              >
                <PowerOff className="w-4 h-4 ms-2" />
                إيقاف
              </Button>
            </div>

            {isStatusLoading ? (
              <Skeleton className="h-64 w-full rounded-2xl" />
            ) : statusData?.status === "qr" && statusData.qrCode ? (
              <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-inner border">
                <QrCode className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-sm text-slate-500 mb-4 text-center">
                  امسح الكود باستخدام تطبيق واتساب لربط الرقم
                </p>
                <img
                  src={statusData.qrCode}
                  alt="QR Code"
                  className="w-48 h-48 border rounded-lg p-2"
                />
              </div>
            ) : statusData?.status === "connected" ? (
              <div className="flex flex-col items-center justify-center p-12 bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-900/30">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-green-800 dark:text-green-400 font-semibold text-lg">
                  الواتساب متصل ويعمل
                </h3>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                <PowerOff className="w-12 h-12 text-slate-400 mb-4" />
                <h3 className="text-slate-500 font-medium">المحرك متوقف</h3>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- بطاقة الإعدادات والأمان --- */}
        <Card className="shadow-sm rounded-3xl border-white/50 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5" />
              إعدادات الواتساب والأمان
            </CardTitle>
            <CardDescription>
              تحكم في إعدادات توثيق الأرقام والـ OTP
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  توثيق الأرقام بـ WhatsApp OTP
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  إلزام المستخدمين الجدد بإرسال كود تفعيل للبوت قبل إنشاء الحساب (يحمي من الاحتيال ويزيد ثقة الرقم).
                </p>
              </div>
              <Switch 
                checked={settingsData?.otpEnabled || false} 
                onCheckedChange={(checked) => toggleOtpMutation.mutate({ enabled: checked })}
                disabled={toggleOtpMutation.isPending}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                رقم البوت الحالي المربوط بالخدمة:
              </label>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-lg text-slate-800 dark:text-slate-200" dir="ltr">
                <Phone className="w-5 h-5 text-slate-400" />
                +{statusData?.phoneNumber || "غير متصل"}
              </div>
              <p className="text-xs text-slate-500">
                هذا هو الرقم الذي سيرسل إليه المستخدمون رسائل التفعيل.
              </p>
            </div>

          </CardContent>
        </Card>

        {/* --- بطاقة الإرسال الفردي --- */}
        <Card className="shadow-sm rounded-3xl border-white/50 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="w-5 h-5" />
              إرسال رسالة فردية
            </CardTitle>
            <CardDescription>
              للاختبار أو لمراسلة مستخدم محدد مباشرة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                رقم الهاتف (مع رمز الدولة، مثال: 201012345678)
              </label>
              <Input
                placeholder="2010..."
                value={directPhone}
                onChange={(e) => setDirectPhone(e.target.value)}
                className="rounded-xl"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                نص الرسالة
              </label>
              <Textarea
                placeholder="اكتب رسالتك هنا..."
                value={directMessage}
                onChange={(e) => setDirectMessage(e.target.value)}
                className="min-h-[120px] rounded-xl"
              />
            </div>
            <Button
              onClick={() =>
                sendDirect.mutate({
                  phone: directPhone,
                  text: directMessage,
                })
              }
              disabled={
                sendDirect.isPending || !directPhone || !directMessage
              }
              className="w-full sm:w-auto rounded-xl"
            >
              {sendDirect.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin ms-2" />
              ) : (
                <Send className="w-4 h-4 ms-2" />
              )}
              إرسال الرسالة
            </Button>
          </CardContent>
        </Card>

        {/* --- بطاقة الإرسال الجماعي --- */}
        <Card className="shadow-sm rounded-3xl border-white/50 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                الإرسال الجماعي (طابور بطيء للحماية من الحظر)
              </div>
              {statusData?.isBroadcasting && (
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  <RefreshCw className="w-3 h-3 animate-spin ms-1 inline" />
                  جاري الإرسال ({statusData?.queueLength} متبقي)
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              اكتب رسالة ليتم إرسالها لكل المستخدمين الذين يملكون أرقام هواتف. يتم إرسال رسالة واحدة كل (2 إلى 4 دقائق) لتجنب الحظر.
              <br/>
              <strong className="text-emerald-600 dark:text-emerald-400">💡 نصيحة للحماية (Spintax):</strong> يمكنك استخدام صيغة التبديل العشوائي لتغيير محتوى الرسالة لكل مستخدم. 
              <br/>
              مثال: <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">&#123;مرحباً|أهلاً|يا هلا&#125; بك، تم إطلاق الميزة الجديدة!</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Textarea
                placeholder="مرحباً بالجميع، تم إطلاق ميزة جديدة..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="min-h-[120px] rounded-xl"
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() =>
                  broadcast.mutate({
                    text: broadcastMessage,
                  })
                }
                disabled={broadcast.isPending || !broadcastMessage}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
              >
                {broadcast.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin ms-2" />
                ) : (
                  <Users className="w-4 h-4 ms-2" />
                )}
                إرسال للجميع ({usersData?.length || 0} مستخدم)
              </Button>
              
              {statusData?.queueLength && statusData.queueLength > 0 ? (
                <Button 
                  variant="destructive"
                  onClick={() => clearQueue.mutate()}
                  disabled={clearQueue.isPending}
                  className="rounded-xl"
                >
                  <Ban className="w-4 h-4 ms-2" />
                  إلغاء الطابور
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* --- قائمة المستخدمين --- */}
        <Card className="shadow-sm rounded-3xl border-white/50 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm lg:col-span-3">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5" />
              أرقام المستخدمين المسجلين ({usersData?.length || 0})
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="بحث بالاسم أو الرقم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pe-10 bg-white dark:bg-slate-950"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isUsersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-end">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="p-4 font-medium rounded-r-xl">الاسم</th>
                      <th className="p-4 font-medium">الهاتف</th>
                      <th className="p-4 font-medium">البريد الإلكتروني</th>
                      <th className="p-4 font-medium">الخطة</th>
                      <th className="p-4 font-medium rounded-l-xl text-start">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(usersData || [])
                      .filter(
                        (u) =>
                          !searchQuery ||
                          u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.phone?.includes(searchQuery) ||
                          u.email?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((user) => (
                      <tr key={`${user.userType}-${user.id}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="p-4">{user.name}</td>
                        <td className="p-4 font-mono text-start" dir="ltr">{user.phone || "غير متوفر"}</td>
                        <td className="p-4 text-start">{user.email || "غير متوفر"}</td>
                        <td className="p-4">
                          <Badge variant="outline" className="rounded-full">
                            {user.plan}
                          </Badge>
                        </td>
                        <td className="p-4 text-start">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="rounded-xl"
                            onClick={() => {
                              setMessageUser(user);
                              setMessageChannel(user.phone ? "whatsapp" : "email");
                            }}
                          >
                            <Send className="w-4 h-4 ms-1" /> مراسلة
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {usersData?.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">
                          لا يوجد مستخدمين مسجلين.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Dialog مراسلة مستخدم محدد --- */}
      <Dialog open={!!messageUser} onOpenChange={(open) => !open && setMessageUser(null)}>
        <DialogContent className="max-w-md p-6 overflow-hidden rounded-3xl" dir="rtl">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <MessageCircle className="w-6 h-6 text-green-500" />
              مراسلة المستخدم: {messageUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>طريقة المراسلة</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={messageChannel === "whatsapp" ? "default" : "outline"}
                  onClick={() => setMessageChannel("whatsapp")}
                  disabled={!messageUser?.phone}
                  className="rounded-xl flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  الواتساب
                </Button>
                <Button
                  type="button"
                  variant={messageChannel === "email" ? "default" : "outline"}
                  onClick={() => setMessageChannel("email")}
                  disabled={!messageUser?.email}
                  className="rounded-xl flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  البريد الإلكتروني
                </Button>
              </div>
              {!messageUser?.phone && messageChannel === "whatsapp" && (
                <p className="text-xs text-rose-500 mt-1">هذا الحساب لا يملك رقم هاتف مسجل</p>
              )}
              {!messageUser?.email && messageChannel === "email" && (
                <p className="text-xs text-rose-500 mt-1">هذا الحساب لا يملك بريد إلكتروني مسجل</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>نص الرسالة</Label>
              <Textarea
                placeholder="اكتب رسالتك هنا..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="min-h-[120px] rounded-xl resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setMessageUser(null)}
                className="rounded-xl"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  if (messageChannel === "whatsapp") {
                    sendDirect.mutate({
                      phone: messageUser.phone,
                      text: messageText,
                    });
                  } else {
                    // Send Email via mailto link
                    const mailtoUrl = `mailto:${messageUser.email}?subject=SmartSpend&body=${encodeURIComponent(messageText)}`;
                    window.open(mailtoUrl, "_blank");
                    setMessageUser(null);
                    setMessageText("");
                    toast.success("تم فتح عميل البريد الإلكتروني الخاص بك لإرسال الرسالة.");
                  }
                }}
                disabled={!messageText.trim() || sendDirect.isPending}
                className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
              >
                {sendDirect.isPending ? "جاري الإرسال..." : "إرسال الآن"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
