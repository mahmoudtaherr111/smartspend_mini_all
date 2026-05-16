import { useState, useEffect } from "react";
import { useAdmin } from "../hooks/useAdmin";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { 
  Users, Shield, Trash2, Search, Download, Printer, Eye, 
  XCircle, CheckCircle, Clock, Ticket, BarChart3, Activity,
  ChevronLeft, ChevronRight, Crown, UserCheck, FileSpreadsheet, FileJson,
  Brain, Mic, Settings2, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [showTickets, setShowTickets] = useState(false);
  const [showExports, setShowExports] = useState(false);
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
      toast.success("تم التصدير بنجاح!");
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
      <div className="flex items-center justify-center h-screen">
        <Card className="p-8 text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">مش مسموحلك</h2>
          <p className="text-muted-foreground">الصفحة دي للأدمن والمشرفين بس.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <SEOMeta path="/admin" title="لوحة التحكم - SmartSpend AI" />

      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8 no-print">
          <div>
            <h1 className="text-3xl font-bold">لوحة التحكم</h1>
            <p className="text-muted-foreground">إدارة المستخدمين والبيانات</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 ml-2" /> طباعة
            </Button>
            <Button variant="outline" onClick={() => setShowExports(true)}>
              <Download className="w-4 h-4 ml-2" /> تصدير
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="no-print">
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard"><BarChart3 className="w-4 h-4 ml-1" /> إحصائيات</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-4 h-4 ml-1" /> المستخدمين</TabsTrigger>
            <TabsTrigger value="tickets"><Ticket className="w-4 h-4 ml-1" /> التذاكر</TabsTrigger>
            {user?.role === "admin" && (
              <>
                <TabsTrigger value="activity"><Activity className="w-4 h-4 ml-1" /> النشاط</TabsTrigger>
                <TabsTrigger value="classification"><Brain className="w-4 h-4 ml-1" /> محرك التصنيف</TabsTrigger>
                <TabsTrigger value="voice"><Mic className="w-4 h-4 ml-1" /> استهلاك الصوت</TabsTrigger>
                <TabsTrigger value="settings"><Shield className="w-4 h-4 ml-1" /> إعدادات الذكاء الاصطناعي</TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Dashboard */}
          <TabsContent value="dashboard">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={<Users className="w-6 h-6" />} label="إجمالي المستخدمين" 
                value={stats.data?.totalUsers ?? 0} color="blue" />
              <StatCard icon={<Crown className="w-6 h-6" />} label="مشتركين برو" 
                value={stats.data?.proUsers ?? 0} color="yellow" />
              <StatCard icon={<Activity className="w-6 h-6" />} label="جلسات نشطة" 
                value={stats.data?.activeSessions ?? 0} color="green" />
              <StatCard icon={<Ticket className="w-6 h-6" />} label="تذاكر مفتوحة" 
                value={stats.data?.openTickets ?? 0} color="red" />
              <StatCard icon={<BarChart3 className="w-6 h-6" />} label="إجمالي المصاريف" 
                value={`${Number(stats.data?.totalAmount || 0).toLocaleString()} ج.م`} color="purple" />
              <StatCard icon={<Clock className="w-6 h-6" />} label="مصاريف اليوم" 
                value={`${Number(stats.data?.todayExpenses || 0).toLocaleString()} ج.م`} color="orange" />
              <StatCard icon={<Users className="w-6 h-6" />} label="مستخدمين OAuth" 
                value={stats.data?.totalOAuthUsers ?? 0} color="indigo" />
              <StatCard icon={<UserCheck className="w-6 h-6" />} label="مستخدمين محليين" 
                value={stats.data?.totalLocalUsers ?? 0} color="teal" />
            </div>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <CardTitle>المستخدمين ({filteredUsers.length})</CardTitle>
                  <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        placeholder="بحث..." 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)}
                        className="pr-10"
                      />
                    </div>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="الدور" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الأدوار</SelectItem>
                        <SelectItem value="user">مستخدم</SelectItem>
                        <SelectItem value="moderator">مشرف</SelectItem>
                        <SelectItem value="admin">أدمن</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={planFilter} onValueChange={setPlanFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="الخطة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الخطط</SelectItem>
                        <SelectItem value="free">مجاني</SelectItem>
                        <SelectItem value="pro">برو</SelectItem>
                        <SelectItem value="ultra">ألترا</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto hidden lg:block">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right py-3 px-2 min-w-[150px]">المستخدم</th>
                        <th className="text-right py-3 px-2 min-w-[80px]">النوع</th>
                        <th className="text-right py-3 px-2 min-w-[120px]">الدور</th>
                        <th className="text-right py-3 px-2 min-w-[100px]">الخطة</th>
                        <th className="text-right py-3 px-2 min-w-[120px]">المصاريف</th>
                        <th className="text-right py-3 px-2 min-w-[100px]">توكنز AI</th>
                        <th className="text-right py-3 px-2 min-w-[100px]">آخر دخول</th>
                        {user?.role === "admin" && <th className="text-right py-3 px-2 min-w-[100px]">إجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u: any) => (
                        <tr key={`${u.userType}-${u.id}`} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2">
                            <div>
                              <p className="font-medium">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{u.email || u.phone}</p>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant={u.userType === "oauth" ? "default" : "secondary"}>
                              {u.userType === "oauth" ? "OAuth" : "محلي"}
                            </Badge>
                          </td>
                          <td className="py-3 px-2">
                            {user?.role === "admin" ? (
                              <Select value={u.role || "user"} onValueChange={(v) => updateRole.mutate({ userId: u.id, userType: u.userType, role: v as any })}>
                                <SelectTrigger className="w-28 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">مستخدم</SelectItem>
                                  <SelectItem value="moderator">مشرف</SelectItem>
                                  <SelectItem value="admin">أدمن</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={u.role === "admin" ? "destructive" : u.role === "moderator" ? "default" : "outline"}>
                                {u.role || "user"}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            {user?.role === "admin" ? (
                              <Select value={u.plan || "free"} onValueChange={(v) => updatePlan.mutate({ userId: u.id, userType: u.userType, plan: v as any })}>
                                <SelectTrigger className="w-24 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">مجاني</SelectItem>
                                  <SelectItem value="pro">برو</SelectItem>
                                  <SelectItem value="ultra">ألترا</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={u.plan === "pro" ? "default" : u.plan === "ultra" ? "destructive" : "secondary"}>
                                {u.plan === "pro" ? "برو" : u.plan === "ultra" ? "ألترا 💎" : "مجاني"}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <p className="font-medium">{Number(u.totalSpent || 0).toLocaleString()} ج.م</p>
                            <p className="text-xs text-muted-foreground">{u.expenseCount || 0} عملية</p>
                          </td>
                          <td className="py-3 px-2">
                            <p className="font-medium text-xs">{Number(u.aiTokensUsed || 0).toLocaleString()}</p>
                          </td>
                          <td className="py-3 px-2 text-xs text-muted-foreground">
                            {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString("ar-EG") : "-"}
                          </td>
                          {user?.role === "admin" && (
                            <td className="py-3 px-2">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => { setSelectedUser(u); setShowSessions(true); }}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="text-red-500" 
                                  onClick={() => { if (confirm("متأكد من الحذف؟")) deleteUser.mutate({ userId: u.id, userType: u.userType }); }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="lg:hidden space-y-3">
                  {filteredUsers.map((u: any) => (
                    <Card key={`m-${u.userType}-${u.id}`} className="border-muted">
                      <CardContent className="p-4 space-y-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <div>
                            <p className="font-semibold">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email || u.phone}</p>
                          </div>
                          <Badge variant={u.userType === "oauth" ? "default" : "secondary"}>
                            {u.userType === "oauth" ? "OAuth" : "محلي"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">{u.role || "user"}</Badge>
                          <Badge variant={u.plan === "pro" ? "default" : u.plan === "ultra" ? "destructive" : "secondary"}>
                            {u.plan === "pro" ? "برو" : u.plan === "ultra" ? "ألترا" : "مجاني"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          مصاريف: {Number(u.totalSpent || 0).toLocaleString()} ج.م — {u.expenseCount || 0} عملية
                        </p>
                        {user?.role === "admin" && (
                          <div className="flex gap-2 pt-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => { setSelectedUser(u); setShowSessions(true); }}>
                              <Eye className="w-4 h-4 ml-1" /> جلسات
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="flex-1"
                              onClick={() => {
                                if (confirm("متأكد من الحذف؟")) deleteUser.mutate({ userId: u.id, userType: u.userType });
                              }}
                            >
                              <Trash2 className="w-4 h-4 ml-1" /> حذف
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Classification Engine */}
          <TabsContent value="classification">
            <ClassificationDashboard />
          </TabsContent>

          {/* Voice Usage */}
          <TabsContent value="voice">
            <VoiceUsageDashboard />
          </TabsContent>

          {/* Tickets */}
          <TabsContent value="tickets">
            <Card>
              <CardHeader>
                <CardTitle>تذاكر الدعم ({ticketsQuery.data?.total ?? 0})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {ticketsQuery.data?.list?.map((t: any) => (
                    <div key={t.id} className="border rounded-lg p-4 hover:bg-muted/30 transition">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {t.userAvatar ? (
                              <img src={t.userAvatar} alt={t.userName} className="w-6 h-6 rounded-full object-cover border" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                <UserCheck className="w-3 h-3 text-slate-500" />
                              </div>
                            )}
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                              {t.userName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold">{t.subject}</h4>
                            <Badge variant={t.status === "open" ? "default" : t.status === "resolved" ? "secondary" : "outline"}>
                              {t.status}
                            </Badge>
                            <Badge variant={t.priority === "urgent" ? "destructive" : "outline"}>
                              {t.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{t.message}</p>
                          {t.response && (
                            <div className="bg-primary/5 rounded-lg p-3 mt-2">
                              <p className="text-xs text-primary font-bold mb-1">رد الدعم:</p>
                              <p className="text-sm">{t.response}</p>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap mr-4">
                          {new Date(t.createdAt).toLocaleDateString("ar-EG")}
                        </div>
                      </div>
                      {(user?.role === "admin" || user?.role === "moderator") && t.status !== "closed" && (
                        <div className="mt-3 flex gap-2">
                          <Input 
                            placeholder="اكتب رد..." 
                            className="flex-1"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const target = e.target as HTMLInputElement;
                                respondTicket.mutate({ id: t.id, response: target.value, status: "resolved" });
                                target.value = "";
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity */}
          {user?.role === "admin" && (
            <>
              <TabsContent value="activity">
                <ActivityLog />
              </TabsContent>
              <TabsContent value="settings">
                <AdminSettingsTab />
              </TabsContent>
            </>
          )}
        </Tabs>

        {/* Sessions Dialog */}
        <Dialog open={showSessions} onOpenChange={setShowSessions}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>جلسات {selectedUser?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sessionsQuery.data?.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{s.ipAddress || "Unknown IP"}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-md">{s.userAgent}</p>
                    <p className="text-xs text-muted-foreground">تنتهي: {new Date(s.expiresAt).toLocaleString("ar-EG")}</p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => revokeSession.mutate({ sessionId: s.id })}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {sessionsQuery.data?.length === 0 && <p className="text-center text-muted-foreground py-8">مفيش جلسات</p>}
            </div>
          </DialogContent>
        </Dialog>

        {/* Exports Dialog */}
        <Dialog open={showExports} onOpenChange={setShowExports}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تصدير البيانات</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Button className="w-full justify-start" variant="outline" onClick={() => exportMutation.mutate({ format: "xlsx" })}>
                <FileSpreadsheet className="w-5 h-5 ml-2 text-green-600" /> تصدير Excel (.xlsx)
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => exportMutation.mutate({ format: "csv" })}>
                <FileJson className="w-5 h-5 ml-2 text-blue-600" /> تصدير CSV
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => exportMutation.mutate({ format: "json" })}>
                <FileJson className="w-5 h-5 ml-2 text-yellow-600" /> تصدير JSON
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-green-500/10 text-green-600",
    red: "bg-red-500/10 text-red-600",
    yellow: "bg-yellow-500/10 text-yellow-600",
    purple: "bg-purple-500/10 text-purple-600",
    orange: "bg-orange-500/10 text-orange-600",
    indigo: "bg-indigo-500/10 text-indigo-600",
    teal: "bg-teal-500/10 text-teal-600",
  };
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className={`p-3 rounded-xl ${colors[color] || colors.blue}`}>
            {icon}
          </div>
        </div>
        <p className="text-2xl font-bold mt-4">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function ActivityLog() {
  const { activity } = useAdmin({ activity: true });
  return (
    <Card>
      <CardHeader><CardTitle>سجل الجلسات والنشاط</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {activity.data?.map((a: any) => (
            <div key={a.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-lg text-sm bg-card hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3 mb-2 sm:mb-0">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <div>
                  <p className="font-bold">{a.userName}</p>
                  <p className="text-xs text-muted-foreground flex gap-2">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{a.userType === "oauth" ? "جوجل" : "محلي"}</Badge>
                    <span>IP: {a.ipAddress}</span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-muted-foreground">{a.userAgent?.substring(0, 40)}{a.userAgent?.length > 40 ? "..." : ""}</p>
                <p className="text-xs">دخول: {new Date(a.createdAt).toLocaleString("ar-EG")}</p>
              </div>
            </div>
          ))}
          {(!activity.data || activity.data.length === 0) && (
            <p className="text-center text-muted-foreground py-8">لا يوجد نشاط مسجل</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}



function ClassificationDashboard() {
  const { classificationStats, classificationLogs } = useAdmin({ classification: true });
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {classificationStats.data?.stats.map((s: any) => (
          <Card key={s.parsedBy}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <Badge variant={s.parsedBy === "ai" ? "default" : s.parsedBy === "rule_engine" ? "secondary" : "outline"}>
                  {s.parsedBy === "ai" ? "🤖 AI" : s.parsedBy === "rule_engine" ? "⚡ Rule Engine" : "🔀 Hybrid"}
                </Badge>
              </div>
              <p className="text-2xl font-bold mt-4">{s.count}</p>
              <p className="text-sm text-muted-foreground">عملية مصنفة</p>
              <div className="mt-2 text-xs flex justify-between">
                <span>متوسط الثقة: {Math.round(s.avgConfidence)}%</span>
                <span>توكنز: {Number(s.totalTokens).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>سجل التصنيف الأخير</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-2">المستخدم</th>
                  <th className="text-right py-2">النص الأصلي</th>
                  <th className="text-right py-2">بواسطة</th>
                  <th className="text-right py-2">الثقة</th>
                  <th className="text-right py-2">القرار</th>
                  <th className="text-right py-2">الوقت</th>
                </tr>
              </thead>
              <tbody>
                {classificationLogs.data?.logs.map((l: any) => (
                  <tr key={l.id} className="border-b hover:bg-muted/30">
                    <td className="py-2">{l.userName}</td>
                    <td className="py-2 max-w-[200px] truncate" title={l.originalText}>{l.originalText}</td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-[10px]">{l.parsedBy}</Badge>
                    </td>
                    <td className="py-2">
                      <span className={l.confidence >= 85 ? "text-green-600" : l.confidence >= 60 ? "text-orange-600" : "text-red-600"}>
                        {l.confidence}%
                      </span>
                    </td>
                    <td className="py-2">
                      <Badge variant={l.decision === "auto_save" ? "default" : l.decision === "review" ? "secondary" : "destructive"} className="text-[10px]">
                        {l.decision}
                      </Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">{new Date(l.createdAt).toLocaleString("ar-EG", { hour: '2-digit', minute: '2-digit' })}</td>
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

function VoiceUsageDashboard() {
  const { voiceUsage } = useAdmin({ voice: true });
  const usage = voiceUsage.data?.usage || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">🎤 استهلاك الصوت لشهر {voiceUsage.data?.month}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {usage.map((u: any) => (
              <div key={u.userType} className="border rounded-xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-lg">{u.userType === "oauth" ? "مستخدمين جوجل" : "مستخدمين محليين"}</h3>
                  <Badge>{u.count} تسجيل</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-3xl font-bold">{Math.round(u.totalSeconds / 60)} دقيقة</p>
                  <p className="text-sm text-muted-foreground">{u.totalSeconds} ثانية إجمالاً</p>
                </div>
              </div>
            ))}
            {usage.length === 0 && <p className="text-center py-8 text-muted-foreground col-span-2">لا يوجد استهلاك مسجل هذا الشهر</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
