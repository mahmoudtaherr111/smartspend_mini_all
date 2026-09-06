import { readUsageDisplay, formatUsageCount, formatUsageUsd } from "@/lib/ai-usage-display";
import React, { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, UserCheck, Eye, Layers } from "lucide-react";
import { TokenAnatomyModal, type LedgerItemData } from "../modals/TokenAnatomyModal";

export function AiUserQuotaInspectorTab() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; type: "oauth" | "local" } | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<LedgerItemData | null>(null);

  const quotaQuery = trpc.admin.getUserAiQuota.useQuery(
    {
      search,
      selectedUserId: selectedUser?.id,
      selectedUserType: selectedUser?.type,
    },
    { enabled: search.trim().length >= 1 },
  );

  const data = quotaQuery.data;
  const user = data?.user;
  const candidates = data?.candidateUsers || [];

  return (
    <div className="space-y-6">
      {/* Header & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-400" />
            فاحص كوتة واستنزاف المستخدمين (User Quota & Request Inspector)
          </h2>
          <p className="text-xs text-slate-400">
            ابحث بالاسم، البريد الإلكتروني، رقم الهاتف، أو الـ ID للاطلاع على فواتير واستهلاك كل مستخدم لحظياً
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedUser(null);
            }}
            placeholder="ابحث بالاسم، الإيميل، الموبايل، أو ID..."
            className="pr-9 bg-slate-900 border-slate-800 text-xs font-mono"
          />
        </div>
      </div>

      {candidates.length > 1 && (
        <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2">
          <span className="text-[11px] font-semibold text-slate-400">
            نتائج مطابقة متعددة ({candidates.length}) — اختر المستخدم المطلوب:
          </span>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c: { id: number; type: "oauth" | "local"; name: string; phone?: string | null; email?: string | null; plan: string }) => {
              const isCurrent = user?.id === c.id && user?.type === c.type;
              return (
                <button
                  key={`${c.type}:${c.id}`}
                  type="button"
                  onClick={() => setSelectedUser({ id: c.id, type: c.type })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2 ${
                    isCurrent
                      ? "bg-indigo-600 border-indigo-500 text-white font-bold shadow"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700"
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({c.phone || c.email || `${c.type}:${c.id}`})
                  </span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-slate-700">
                    {c.plan}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!user || !data ? (
        <Card className="p-12 text-center bg-slate-900/40 border-slate-800">
          <Search className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-300">
            {search.trim() ? "لم يتم العثور على مستخدم مطابق لهذا البحث" : "أدخل اسم العميل، بريده، رقم هاتفه، أو الـ ID للبدء"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            يتم فحص دورة الفاتورة الشهرية الحالية وجميع طلبات الشات والتصنيف والـ OCR المسجلة
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* User Hero & Quota Gauge */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* User Profile Card */}
            <Card className="bg-slate-900/70 border-slate-800 shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-xs uppercase font-bold">
                    باقة {user.plan}
                  </Badge>
                  <span className="text-[11px] text-slate-500 font-mono">
                    ID: {user.type}:{user.id}
                  </span>
                </div>
                <CardTitle className="text-lg font-bold text-slate-100 pt-2">{user.name}</CardTitle>
                <CardDescription className="text-xs text-slate-400 font-mono">
                  {user.phone || user.email || "بدون وسيلة تواصل"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-400 space-y-1.5 pt-2 border-t border-slate-800/80">
                <div className="flex justify-between">
                  <span>دورة الفاتورة:</span>
                  <span className="font-mono text-slate-200 font-bold">{data.billingPeriod}</span>
                </div>
                <div className="flex justify-between">
                  <span>تكلفة المستخدم للمنصة:</span>
                  <span className="font-mono text-amber-400 font-bold">${Number(data.totalCostUsd || 0).toFixed(6)} USD (المعروف فقط)</span>
                </div>
              </CardContent>
            </Card>

            {/* Quota Gauge */}
            <Card className="bg-slate-900/70 border-slate-800 shadow-md md:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">مؤشر استهلاك باقة الذكاء الاصطناعي الشهرية</span>
                  <span className="font-mono text-indigo-400 font-bold text-sm">
                    {data.totalTokens.toLocaleString()} / {data.quotaLimit.toLocaleString()} ({data.percentUsed}%)
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="w-full bg-slate-950 h-4 rounded-full overflow-hidden border border-slate-800 p-0.5">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.percentUsed > 90
                        ? "bg-rose-500"
                        : data.percentUsed > 70
                        ? "bg-amber-500"
                        : "bg-indigo-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(3, data.percentUsed))}%` }}
                  />
                </div>

                {/* Channel Split Chips */}
                <div className="flex flex-wrap gap-3 text-xs pt-1">
                  {Object.entries(data.byChannel || {}).map(([channel, tokens]) => (
                    <div key={channel} className="bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2 font-mono">
                      <span className="font-sans text-slate-400">{channel}:</span>
                      <span className="font-bold text-slate-200">{Number(tokens).toLocaleString()} tok</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Request Audit Stream Table */}
          <Card className="bg-slate-900/70 border-slate-800 shadow-lg">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-200">
                <Layers className="w-4 h-4 text-indigo-400" />
                سجل طلبات المستخدم المفصل (Itemized Ledger Stream)
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                اضغط على أي طلب لتشريح حجم التوكنز والبرومبت والتكلفة الفعلية
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-semibold">الوقت</th>
                      <th className="pb-3 font-semibold">القناة</th>
                      <th className="pb-3 font-semibold">المزود والموديل</th>
                      <th className="pb-3 font-semibold">إدخال (Prompt)</th>
                      <th className="pb-3 font-semibold">إخراج (Out)</th>
                      <th className="pb-3 font-semibold">كاش</th>
                      <th className="pb-3 font-semibold">التكلفة</th>
                      <th className="pb-3 font-semibold text-center">فحص</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {data.recentRequests.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-500 font-sans">
                          لا توجد طلبات مسجلة لهذا المستخدم في هذا الشهر
                        </td>
                      </tr>
                    ) : (
                      data.recentRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 text-slate-400">
                            {new Date(req.createdAt).toLocaleTimeString("ar-EG")}
                          </td>
                          <td className="py-3 font-sans">
                            <Badge variant="outline" className="text-[10px] border-slate-700 bg-slate-950">
                              {req.channel}
                            </Badge>
                          </td>
                          <td className="py-3 font-bold text-slate-200">
                            {req.providerSlug}
                            <span className="block text-[10px] text-slate-500 font-normal truncate max-w-[150px]">
                              {req.modelId}
                            </span>
                          </td>
                          <td className="py-3 text-slate-300">{formatUsageCount(readUsageDisplay(req).input)}</td>
                          <td className="py-3 text-sky-400 font-bold">{formatUsageCount(readUsageDisplay(req).output)}</td>
                          <td className="py-3 text-emerald-400">{formatUsageCount(readUsageDisplay(req).cache)}</td>
                          <td className="py-3 text-amber-400 font-bold">
                            {formatUsageUsd(readUsageDisplay(req).usd)}
                          </td>
                          <td className="py-3 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedLedger(req)}
                              className="h-7 text-[11px] font-sans border-indigo-600/30 text-indigo-300 hover:bg-indigo-600/10"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              تشريح
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Token Anatomy Inspector Modal */}
      <TokenAnatomyModal
        isOpen={Boolean(selectedLedger)}
        onClose={() => setSelectedLedger(null)}
        ledgerItem={selectedLedger}
      />
    </div>
  );
}
