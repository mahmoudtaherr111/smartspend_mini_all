import { useState } from "react";
import { useAdmin } from "../hooks/useAdmin";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { 
  Users, Shield, Trash2, Search, Download, Printer, Eye, 
  XCircle, CheckCircle, Clock, Ticket, BarChart3, Activity,
  ChevronLeft, ChevronRight, Crown, UserCheck, FileSpreadsheet, FileJson
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function Admin() {
  const { user } = useAuth();
  const { stats, users, updateRole, updatePlan, deleteUser, revokeSession } = useAdmin();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [showTickets, setShowTickets] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  const sessionsQuery = trpc.admin.getUserSessions.useQuery(
    { userId: selectedUser?.id, userType: selectedUser?.userType },
    { enabled: showSessions && !!selectedUser }
  );

  const ticketsQuery = trpc.support.listAll.useQuery(
    { page: 1, limit: 50 },
    { enabled: showTickets }
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
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
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
              <TabsTrigger value="activity"><Activity className="w-4 h-4 ml-1" /> النشاط</TabsTrigger>
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
                        <SelectItem value="">الكل</SelectItem>
                        <SelectItem value="user">مستخدم</SelectItem>
                        <SelectItem value="moderator">مشرف</SelectItem>
                        <SelectItem value="admin">أدمن</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right py-3 px-2">المستخدم</th>
                        <th className="text-right py-3 px-2">النوع</th>
                        <th className="text-right py-3 px-2">الدور</th>
                        <th className="text-right py-3 px-2">الخطة</th>
                        <th className="text-right py-3 px-2">المصاريف</th>
                        <th className="text-right py-3 px-2">آخر دخول</th>
                        {user?.role === "admin" && <th className="text-right py-3 px-2">إجراءات</th>}
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
                              <Select value={u.role} onValueChange={(v) => updateRole.mutate({ userId: u.id, userType: u.userType, role: v as any })}>
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
                                {u.role}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            {user?.role === "admin" ? (
                              <Select value={u.plan} onValueChange={(v) => updatePlan.mutate({ userId: u.id, userType: u.userType, plan: v as any })}>
                                <SelectTrigger className="w-24 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">مجاني</SelectItem>
                                  <SelectItem value="pro">برو</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={u.plan === "pro" ? "default" : "secondary"}>
                                {u.plan === "pro" ? "برو" : "مجاني"}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <p className="font-medium">{Number(u.totalSpent || 0).toLocaleString()} ج.م</p>
                            <p className="text-xs text-muted-foreground">{u.expenseCount} عملية</p>
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
              </CardContent>
            </Card>
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
            <TabsContent value="activity">
              <ActivityLog />
            </TabsContent>
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
  const { activity } = useAdmin();
  return (
    <Card>
      <CardHeader><CardTitle>سجل النشاط</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {activity.data?.map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 p-3 border rounded-lg text-sm">
              <div className={`w-2 h-2 rounded-full ${
                a.event === "login" ? "bg-green-500" : 
                a.event === "logout" ? "bg-red-500" : 
                a.event === "expense_create" ? "bg-blue-500" : "bg-gray-500"
              }`} />
              <div className="flex-1">
                <p className="font-medium">{a.event}</p>
                <p className="text-xs text-muted-foreground">{JSON.stringify(a.metadata)}</p>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("ar-EG")}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
