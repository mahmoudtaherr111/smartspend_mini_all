import { useState, useEffect } from "react";
import { useAdmin } from "../hooks/useAdmin";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import {
  Users, Shield, Trash2, Search, Download, Printer, Eye,
  XCircle, CheckCircle, Clock, Ticket, BarChart3, Activity,
  ChevronLeft, ChevronRight, Crown, UserCheck, FileSpreadsheet, FileJson,
  Brain, Mic, Settings2, Info, LayoutDashboard, Server, ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AdminSettingsTab } from "@/components/admin/AdminSettingsTab";

export default function Admin() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  const { stats, users, updateRole, updatePlan, deleteUser, revokeSession } = useAdmin({
    dashboard: activeTab === "dashboard",
    users: activeTab === "users",
    activity: false,
    classification: false,
    voice: false,
  });

  const sessionsQuery = trpc.admin.getUserSessions.useQuery(
    { userId: selectedUser?.id, userType: selectedUser?.userType },
    { enabled: showSessions && !!selectedUser }
  );

  const profileQuery = trpc.admin.getUserSmartProfile.useQuery(
    { userId: selectedUser?.id, userType: selectedUser?.userType },
    { enabled: showProfile && !!selectedUser }
  );

  const ticketsQuery = trpc.support.listAll.useQuery(
    { page: 1, limit: 50 },
    { enabled: activeTab === "tickets" }
  );

  const exportMutation = trpc.export.allUsers.useMutation({
    onSuccess: (data) => {
      if (data.format === "json") {
        const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click();
      } else if (data.format === "csv") {
        const blob = new Blob(["\ufeff" + data.data], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click();
      } else if (data.format === "xlsx") {
        const binary = atob(data.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click();
      }
      toast.success("تم تصدير البيانات بنجاح ✅");
      setShowExports(false);
    }
  });

  const respondTicket = trpc.support.respond.useMutation({ onSuccess: () => ticketsQuery.refetch() });

  const handlePrint = () => window.print();

  const filteredUsers = users.data?.users?.filter((u: any) => {
    const matchSearch = !search || u.name?.includes(search) || u.email?.includes(search) || u.phone?.includes(search);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const matchPlan = planFilter === "all" || u.plan === planFilter;
    return matchSearch && matchRole && matchPlan;
  }) || [];

  if (user?.role !== "admin" && user?.role !== "moderator") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950">
        <Card className="p-10 text-center max-w-md border-rose-100 shadow-xl shadow-rose-100/50">
          <ShieldAlert className="w-20 h-20 text-rose-500 mx-auto mb-6" />
          <h2 className="text-3xl font-black mb-3 text-slate-800">وصول غير مصرح</h2>
          <p className="text-slate-500">هذه المنطقة مخصصة للإدارة العليا والمشرفين فقط. سيتم تسجيل محاولة الدخول الخاصة بك.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950/50 pb-20" dir="rtl">
      <SEOMeta path="/admin" title="لوحة التحكم الإدارية | SmartSpend" />

      {/* Top Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 border-b shadow-sm sticky top-0 z-30 no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white p-2 rounded-lg">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">مركز القيادة</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">SmartSpend OS</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={handlePrint} className="hidden sm:flex gap-2">
                <Printer className="w-4 h-4" /> طباعة
              </Button>
              <Button variant="default" size="sm" onClick={() => setShowExports(true)} className="gap-2 bg-slate-800 hover:bg-slate-700">
                <Download className="w-4 h-4" /> تصدير
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="no-print">

          <TabsList className="mb-8 bg-white dark:bg-slate-900 p-1 rounded-xl shadow-sm border flex-wrap h-auto justify-start w-fit">
            <TabsTrigger value="dashboard" className="gap-2 py-2.5 px-4 rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-900/30">
              <LayoutDashboard className="w-4 h-4" /> الإحصائيات
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2 py-2.5 px-4 rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30">
              <Users className="w-4 h-4" /> المستخدمين
            </TabsTrigger>
            <TabsTrigger value="tickets" className="gap-2 py-2.5 px-4 rounded-lg data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-900/30">
              <Ticket className="w-4 h-4" /> الدعم الفني
            </TabsTrigger>
            {user?.role === "admin" && (
              <>
                <TabsTrigger value="classification" className="gap-2 py-2.5 px-4 rounded-lg data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/30">
                  <Brain className="w-4 h-4" /> محرك التصنيف
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2 py-2.5 px-4 rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800">
                  <Settings2 className="w-4 h-4" /> إعدادات النظام
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <div className="animate-in fade-in-50 duration-500 slide-in-from-bottom-4">
            {/* 1. Dashboard Tab */}
            <TabsContent value="dashboard">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={<Users className="w-6 h-6" />} label="إجمالي المسجلين" value={stats.data?.totalUsers ?? 0} color="blue" />
                <StatCard icon={<Crown className="w-6 h-6" />} label="مشتركين البرو والألترا" value={stats.data?.proUsers ?? 0} color="yellow" />
                <StatCard icon={<Activity className="w-6 h-6" />} label="متصلين الآن (جلسات)" value={stats.data?.activeSessions ?? 0} color="green" />
                <StatCard icon={<Ticket className="w-6 h-6" />} label="تذاكر دعم مفتوحة" value={stats.data?.openTickets ?? 0} color="red" />

                <StatCard icon={<BarChart3 className="w-6 h-6" />} label="حجم المعاملات المالي" value={`${Number(stats.data?.totalAmount || 0).toLocaleString()} ج.م`} color="purple" />
                <StatCard icon={<Clock className="w-6 h-6" />} label="تدفقات اليوم" value={`${Number(stats.data?.todayExpenses || 0).toLocaleString()} ج.م`} color="orange" />

                <StatCard icon={<Users className="w-6 h-6" />} label="تسجيل عبر جوجل" value={stats.data?.totalOAuthUsers ?? 0} color="indigo" />
                <StatCard icon={<UserCheck className="w-6 h-6" />} label="تسجيل محلي" value={stats.data?.totalLocalUsers ?? 0} color="teal" />
              </div>
            </TabsContent>

            {/* 2. Users Tab */}
            <TabsContent value="users" className="space-y-6">
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50/80 dark:bg-slate-900 border-b p-4 sm:p-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">قاعدة بيانات المستخدمين</CardTitle>
                    <CardDescription>إدارة {filteredUsers.length} حساب مسجل بالنظام</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64 min-w-[200px]">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input placeholder="بحث بالاسم، الإيميل، رقم الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10 bg-white dark:bg-slate-950" />
                    </div>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-32 bg-white dark:bg-slate-950"><SelectValue placeholder="الصلاحية" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل (الصلاحيات)</SelectItem>
                        <SelectItem value="user">مستخدم عادي</SelectItem>
                        <SelectItem value="moderator">مشرف</SelectItem>
                        <SelectItem value="admin">إدارة عليا</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={planFilter} onValueChange={setPlanFilter}>
                      <SelectTrigger className="w-32 bg-white dark:bg-slate-950"><SelectValue placeholder="الباقة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل (الباقات)</SelectItem>
                        <SelectItem value="free">المجانية</SelectItem>
                        <SelectItem value="pro">باقة البرو</SelectItem>
                        <SelectItem value="ultra">باقة الألترا</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-medium border-b">
                      <tr>
                        <th className="py-4 px-6 min-w-[200px]">معلومات الحساب</th>
                        <th className="py-4 px-4 min-w-[120px]">نوع التسجيل</th>
                        <th className="py-4 px-4 min-w-[130px]">الصلاحية</th>
                        <th className="py-4 px-4 min-w-[130px]">الباقة الحالية</th>
                        <th className="py-4 px-4 min-w-[150px]">إحصائيات النشاط</th>
                        <th className="py-4 px-4 min-w-[130px]">استهلاك AI</th>
                        <th className="py-4 px-4 min-w-[120px]">آخر تواجد</th>
                        {user?.role === "admin" && <th className="py-4 px-6 min-w-[120px] text-center">إدارة</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u: any) => (
                        <tr key={`${u.userType}-${u.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                                {u.name?.[0] || "?"}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">{u.name}</p>
                                <p className="text-xs text-slate-500">{u.email || u.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <Badge variant="outline" className={u.userType === "oauth" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"}>
                              {u.userType === "oauth" ? "Google OAuth" : "Local Auth"}
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            {user?.role === "admin" ? (
                              <Select value={u.role || "user"} onValueChange={(v) => updateRole.mutate({ userId: u.id, userType: u.userType, role: v as any })}>
                                <SelectTrigger className="w-28 h-8 text-xs bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">مستخدم عادي</SelectItem>
                                  <SelectItem value="moderator">مشرف نظام</SelectItem>
                                  <SelectItem value="admin">إدارة عليا</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={u.role === "admin" ? "destructive" : "secondary"}>{u.role || "user"}</Badge>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {user?.role === "admin" ? (
                              <Select value={u.plan || "free"} onValueChange={(v) => updatePlan.mutate({ userId: u.id, userType: u.userType, plan: v as any })}>
                                <SelectTrigger className="w-28 h-8 text-xs bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">المجانية</SelectItem>
                                  <SelectItem value="pro">برو ⭐</SelectItem>
                                  <SelectItem value="ultra">ألترا 💎</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{u.plan}</Badge>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <p className="font-bold text-slate-700 dark:text-slate-300">{Number(u.totalSpent || 0).toLocaleString()} ج.م</p>
                            <p className="text-xs text-slate-500">{u.expenseCount || 0} عملية مسجلة</p>
                          </td>
                          <td className="py-4 px-4">
                            <Badge variant="secondary" className="font-mono">{Number(u.aiTokensUsed || 0).toLocaleString()} T</Badge>
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-500 font-mono">
                            {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString("ar-EG") : "غير متوفر"}
                          </td>
                          {user?.role === "admin" && (
                            <td className="py-4 px-6">
                              <div className="flex gap-2 justify-center">
                                <Button size="icon" variant="outline" className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-600 border-emerald-100 text-emerald-500" onClick={() => { setSelectedUser(u); setShowProfile(true); }} title="عرض البروفايل">
                                  <UserCheck className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="outline" className="h-8 w-8 hover:bg-slate-100" onClick={() => { setSelectedUser(u); setShowSessions(true); }} title="سجل الجلسات">
                                  <Eye className="w-4 h-4 text-slate-600" />
                                </Button>
                                <Button size="icon" variant="outline" className="h-8 w-8 hover:bg-rose-50 hover:text-rose-600 border-rose-100 text-rose-500" onClick={() => { if (confirm("تحذير: سيتم حذف بيانات المستخدم بالكامل. هل أنت متأكد؟")) deleteUser.mutate({ userId: u.id, userType: u.userType }); }} title="حذف الحساب">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={8} className="py-8 text-center text-slate-500">لا يوجد مستخدمين يطابقون بحثك.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>

            {/* 3. Tickets Tab */}
            <TabsContent value="tickets">
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-900 border-b p-6">
                  <CardTitle>مركز الدعم الفني والمساعدة</CardTitle>
                  <CardDescription>متابعة والرد على استفسارات ومشكلات المستخدمين ({ticketsQuery.data?.total ?? 0})</CardDescription>
                </div>
                <div className="p-6 space-y-4 bg-slate-50/30">
                  {ticketsQuery.data?.list?.map((t: any) => (
                    <div key={t.id} className="bg-white dark:bg-slate-950 border rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                              {t.userAvatar ? <img src={t.userAvatar} alt="" className="w-full h-full rounded-full object-cover" /> : <UserCheck className="w-4 h-4 text-slate-400" />}
                            </div>
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 block leading-none">{t.userName}</span>
                              <span className="text-[10px] text-slate-400">{new Date(t.createdAt).toLocaleString("ar-EG")}</span>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-base text-indigo-900 dark:text-indigo-300">{t.subject}</h4>
                              <Badge variant={t.status === "open" ? "destructive" : "secondary"} className="text-[10px]">{t.status === "open" ? "مفتوحة" : "مغلقة"}</Badge>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border">{t.message}</p>
                          </div>

                          {t.response && (
                            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 rounded-lg p-4 mt-2">
                              <p className="text-xs text-emerald-600 font-bold mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> رد الإدارة:</p>
                              <p className="text-sm text-emerald-800 dark:text-emerald-200">{t.response}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      {(user?.role === "admin" || user?.role === "moderator") && t.status !== "closed" && (
                        <div className="mt-4 pt-4 border-t flex gap-3">
                          <Input
                            placeholder="اكتب ردك هنا ثم اضغط Enter للإرسال..."
                            className="flex-1 bg-slate-50 dark:bg-slate-900"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const target = e.target as HTMLInputElement;
                                if (target.value.trim()) {
                                  respondTicket.mutate({ id: t.id, response: target.value, status: "resolved" });
                                  target.value = "";
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {ticketsQuery.data?.list?.length === 0 && <div className="text-center p-10 text-slate-400">لا توجد تذاكر دعم فني حالياً.</div>}
                </div>
              </Card>
            </TabsContent>

            {/* 4. Classification & Voice (Admin Only) */}
            {user?.role === "admin" && (
              <>
                <TabsContent value="classification">
                  <ClassificationDashboard />
                </TabsContent>
                <TabsContent value="settings">
                  <AdminSettingsTab />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={showSessions} onOpenChange={setShowSessions}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-slate-50 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              سجل الجلسات والأمان - {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
            {sessionsQuery.data?.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-950 border dark:border-slate-800 rounded-xl shadow-sm">
                <div>
                  <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{s.ipAddress || "Unknown IP"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg truncate mt-1">{s.userAgent}</p>
                  <p className="text-[10px] text-slate-400 mt-2">تنتهي الصلاحية: {new Date(s.expiresAt).toLocaleString("ar-EG")}</p>
                </div>
                <Button size="sm" variant="outline" className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 border-rose-100" onClick={() => revokeSession.mutate({ sessionId: s.id })}>
                  إنهاء الجلسة
                </Button>
              </div>
            ))}
            {sessionsQuery.data?.length === 0 && <p className="text-center text-slate-400 py-10">لا توجد جلسات نشطة حالياً</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* User Profile Dialog */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[85vh]">
          <DialogHeader className="p-6 bg-gradient-to-r from-emerald-50 to-sky-50 dark:from-emerald-950/30 dark:to-sky-950/30 border-b">
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              بروفايل المستخدم — {selectedUser?.name || "مستخدم"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-5 overflow-y-auto max-h-[65vh]" dir="rtl">
            {profileQuery.isLoading && <p className="text-center text-slate-400 py-10">جاري تحميل البروفايل...</p>}
            {profileQuery.data && (() => {
              const p = profileQuery.data as any;
              const fi = p.financialInfo || {};
              const li = p.lifestyleInfo || {};
              const bi = p.basicInfo || {};
              const prefs = p.preferences || {};
              const answers = p.onboardingAnswers || {};
              const answeredCount = Object.keys(answers).length;

              const InfoRow = ({ label, value }: { label: string; value: string }) => (
                <div className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-medium">{value || "—"}</span>
                </div>
              );

              return (
                <div className="space-y-5">
                  {/* Identity */}
                  <Card>
                    <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> الهوية</CardTitle></CardHeader>
                    <CardContent className="px-4 pb-4">
                      <InfoRow label="الاسم" value={bi.name || selectedUser?.name} />
                      <InfoRow label="الهاتف" value={bi.phone || selectedUser?.phone || "—"} />
                      <InfoRow label="البريد" value={bi.email || selectedUser?.email || "—"} />
                      <InfoRow label="المهنة" value={String(bi.profession || "—")} />
                      <InfoRow label="الإجابات المكتملة" value={`${answeredCount} / 19`} />
                      <InfoRow label="البروفايل مكتمل" value={p.profileCompleted ? "✅ نعم" : "❌ لا"} />
                    </CardContent>
                  </Card>

                  {/* Financial */}
                  <Card>
                    <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" /> الوضع المالي</CardTitle></CardHeader>
                    <CardContent className="px-4 pb-4">
                      <InfoRow label="الدخل الشهري" value={fi.averageMonthlyIncome ? `${Number(fi.averageMonthlyIncome).toLocaleString()} ج.م` : "—"} />
                      <InfoRow label="مصادر الدخل" value={Array.isArray(fi.incomeSources) ? fi.incomeSources.join("، ") : "—"} />
                      <InfoRow label="الهدف" value={String(fi.primaryGoal || "—")} />
                      <InfoRow label="ديون/أقساط" value={fi.hasDebt === true ? `نعم (${fi.monthlyDebtPayment || "؟"} ج.م/شهر)` : fi.hasDebt === false ? "لا" : "—"} />
                    </CardContent>
                  </Card>

                  {/* Lifestyle */}
                  <Card>
                    <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> نمط الحياة</CardTitle></CardHeader>
                    <CardContent className="px-4 pb-4">
                      <InfoRow label="أطفال" value={li.hasChildren ? `نعم (${li.childrenCount || ""})` : "لا"} />
                      {Array.isArray(li.childrenNames) && li.childrenNames.length > 0 && <InfoRow label="أسماء الأطفال" value={li.childrenNames.join("، ")} />}
                      {li.partnerName && <InfoRow label="شريك الحياة" value={String(li.partnerName)} />}
                      <InfoRow label="وضع السكن" value={String(li.livingSituation || "—")} />
                      <InfoRow label="نوع السكن" value={String(li.housingType || "—")} />
                      {li.monthlyRent && <InfoRow label="الإيجار" value={`${Number(li.monthlyRent).toLocaleString()} ج.م`} />}
                      <InfoRow label="يدعم مالياً" value={Array.isArray(li.supportsOthers) ? li.supportsOthers.join("، ") : "—"} />
                      <InfoRow label="سيارة" value={li.carOwnership ? `${li.carType || "نعم"}${li.monthlyCarCost ? ` (${Number(li.monthlyCarCost).toLocaleString()} ج/شهر)` : ""}` : "لا"} />
                      <InfoRow label="تدخين" value={li.smoking ? "نعم 🚬" : "لا"} />
                      {Array.isArray(li.petNames) && li.petNames.length > 0 && <InfoRow label="حيوانات أليفة" value={li.petNames.join("، ")} />}
                      {Array.isArray(li.subscriptions) && li.subscriptions.length > 0 && <InfoRow label="اشتراكات" value={li.subscriptions.join("، ")} />}
                      {Array.isArray(li.regularContacts) && li.regularContacts.length > 0 && <InfoRow label="أشخاص بيحولهم فلوس" value={li.regularContacts.join("، ")} />}
                    </CardContent>
                  </Card>

                  {/* Raw onboarding answers */}
                  <Card>
                    <CardHeader className="py-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" /> إجابات الـ Onboarding ({answeredCount})</CardTitle></CardHeader>
                    <CardContent className="px-4 pb-4">
                      {Object.entries(answers).map(([key, ans]: [string, any]) => (
                        <InfoRow key={key} label={key} value={ans?.skipped ? "⏭️ تم تخطيه" : JSON.stringify(ans?.value)} />
                      ))}
                      {answeredCount === 0 && <p className="text-center text-sm text-slate-400 py-4">لم يجب على أي سؤال بعد</p>}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExports} onOpenChange={setShowExports}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تصدير قاعدة البيانات</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-4">
            <Button className="w-full justify-start h-12 text-base" variant="outline" onClick={() => exportMutation.mutate({ format: "xlsx" })}>
              <FileSpreadsheet className="w-5 h-5 ml-3 text-emerald-600" /> تصدير كملف Excel (.xlsx)
            </Button>
            <Button className="w-full justify-start h-12 text-base" variant="outline" onClick={() => exportMutation.mutate({ format: "csv" })}>
              <FileJson className="w-5 h-5 ml-3 text-blue-600" /> تصدير كملف CSV
            </Button>
            <Button className="w-full justify-start h-12 text-base" variant="outline" onClick={() => exportMutation.mutate({ format: "json" })}>
              <FileJson className="w-5 h-5 ml-3 text-amber-600" /> تصدير كملف JSON (نسخة احتياطية للمطورين)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, { bg: string, text: string, shadow: string }> = {
    blue: { bg: "bg-blue-500/10", text: "text-blue-600", shadow: "shadow-blue-500/10" },
    green: { bg: "bg-green-500/10", text: "text-green-600", shadow: "shadow-green-500/10" },
    red: { bg: "bg-red-500/10", text: "text-red-600", shadow: "shadow-red-500/10" },
    yellow: { bg: "bg-yellow-500/10", text: "text-amber-600", shadow: "shadow-amber-500/10" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-600", shadow: "shadow-purple-500/10" },
    orange: { bg: "bg-orange-500/10", text: "text-orange-600", shadow: "shadow-orange-500/10" },
    indigo: { bg: "bg-indigo-500/10", text: "text-indigo-600", shadow: "shadow-indigo-500/10" },
    teal: { bg: "bg-teal-500/10", text: "text-teal-600", shadow: "shadow-teal-500/10" },
  };
  const theme = colors[color] || colors.blue;

  return (
    <Card className={`border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${theme.shadow}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-2xl ${theme.bg} ${theme.text}`}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{value}</p>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function ClassificationDashboard() {
  const { classificationStats, classificationLogs } = useAdmin({ classification: true });

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {classificationStats.data?.stats.map((s: any) => (
          <Card key={s.parsedBy} className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-indigo-500">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Badge variant={s.parsedBy === "ai" ? "default" : s.parsedBy === "rule_engine" ? "secondary" : "outline"} className="px-3 py-1">
                  {s.parsedBy === "ai" ? "🤖 ذكاء اصطناعي عميق" : s.parsedBy === "rule_engine" ? "⚡ محرك القواعد" : "🔀 هجين"}
                </Badge>
              </div>
              <p className="text-4xl font-black text-slate-800">{s.count}</p>
              <p className="text-sm font-bold text-slate-500 mt-1">عملية معالجة</p>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-xs font-mono text-slate-500">
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> دقة: {Math.round(s.avgConfidence)}%</span>
                <span className="flex items-center gap-1"><Brain className="w-3 h-3 text-indigo-400" /> {Number(s.totalTokens).toLocaleString()} Token</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
          <CardTitle>مراقب التصنيف المباشر (Classification Live Feed)</CardTitle>
          <CardDescription>أحدث عمليات المعالجة التي مرت عبر المحرك الذكي</CardDescription>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b font-medium text-right">
                <tr>
                  <th className="py-3 px-6">المستخدم</th>
                  <th className="py-3 px-4">النص الأصلي (الإدخال)</th>
                  <th className="py-3 px-4">المحرك</th>
                  <th className="py-3 px-4">درجة الثقة</th>
                  <th className="py-3 px-4">القرار المتخذ</th>
                  <th className="py-3 px-6">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classificationLogs.data?.logs.map((l: any) => (
                  <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-6 font-bold text-slate-700 dark:text-slate-300">{l.userName}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium max-w-[250px] truncate" title={l.originalText}>"{l.originalText}"</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="bg-white dark:bg-slate-950">{l.parsedBy}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-mono font-bold px-2 py-1 rounded-md text-xs ${l.confidence >= 85 ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : l.confidence >= 60 ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"}`}>
                        {l.confidence}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={l.decision === "auto_save" ? "default" : l.decision === "review" ? "secondary" : "destructive"} className="text-xs">
                        {l.decision === "auto_save" ? "حفظ تلقائي" : l.decision === "review" ? "مراجعة يدوية" : "فشل/رفض"}
                      </Badge>
                    </td>
                    <td className="py-3 px-6 text-xs text-slate-400 font-mono">
                      {new Date(l.createdAt).toLocaleString("ar-EG", { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
