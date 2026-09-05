import { useState } from "react";
import {
  Card,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Calendar, Plus, Trash2 } from "lucide-react";
import { FieldLabel, SectionHeader } from "./AdminSettingsShared";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";

// ─── Discount Codes Manager ───
function DiscountCodesManager() {
  const utils = trpc.useUtils();
  const { data: codes, isLoading } = trpc.admin.getDiscountCodes.useQuery();
  const createCode = trpc.admin.createDiscountCode.useMutation({
    onSuccess: () => {
      toast.success("تم إصدار الكود بنجاح 🎉");
      utils.admin.getDiscountCodes.invalidate();
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteCode = trpc.admin.deleteDiscountCode.useMutation({
    onSuccess: () => {
      toast.success("تم إبطال الكود");
      utils.admin.getDiscountCodes.invalidate();
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState("20");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4 flex items-center justify-between">
        <CardTitle className="text-lg">حملات العروض الترويجية</CardTitle>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
        >
          <Plus className="w-4 h-4" /> إصدار كود جديد
        </Button>
      </div>

      {showForm && (
        <div className="p-6 bg-slate-50/80 dark:bg-slate-900/80 border-b dark:border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="space-y-2">
              <Label className="text-sm font-bold">اسم الكود (إنجليزي)</Label>
              <Input
                placeholder="EID2024"
                dir="ltr"
                className="font-mono uppercase dark:bg-slate-950"
                value={newCode}
                onChange={(e) =>
                  setNewCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">نسبة الخصم %</Label>
              <Input
                type="number"
                dir="ltr"
                min="1"
                max="100"
                className="font-mono dark:bg-slate-950"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">أقصى عدد استخدام</Label>
              <Input
                type="number"
                dir="ltr"
                placeholder="لا نهائي"
                className="font-mono dark:bg-slate-950"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">تاريخ الانتهاء</Label>
              <Input
                type="date"
                dir="ltr"
                className="dark:bg-slate-950"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              className="gap-2 w-full md:w-auto"
              disabled={!newCode || createCode.isPending}
              onClick={() =>
                createCode.mutate({
                  code: newCode,
                  discountPercent: Number(newDiscount) || 20,
                  maxUses: newMaxUses ? Number(newMaxUses) : undefined,
                  expiresAt: newExpiry || undefined,
                })
              }
            >
              {createCode.isPending ? "جاري الإصدار..." : "تفعيل الكود"}
            </Button>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">
            جاري تحميل البيانات...
          </div>
        ) : (
          <div className="divide-y">
            {(!codes || codes.length === 0) && (
              <div className="p-8 text-center text-slate-500">
                لا توجد أكواد ترويجية مُفعلة حالياً.
              </div>
            )}
            {codes?.map((c: any) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-6 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors gap-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono font-bold text-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                    {c.code}
                  </span>
                  <Badge
                    variant="default"
                    className="bg-emerald-500 hover:bg-emerald-600"
                  >
                    {c.discountPercent}% خصم
                  </Badge>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border dark:border-slate-700 px-3 py-1 rounded-full shadow-sm">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {c.usedCount || 0}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <span>{c.maxUses ? c.maxUses : "∞"} استخدام</span>
                  </div>
                  {c.expiresAt && (
                    <span className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded border border-rose-100 dark:border-rose-900/30 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> ينتهي:{" "}
                      {new Date(c.expiresAt).toLocaleDateString("ar-EG")}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 self-end sm:self-auto"
                  onClick={() => {
                    if (confirm("إبطال هذا الكود الترويجي؟"))
                      deleteCode.mutate({ id: c.id });
                  }}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AdminCodesTabProps {
  formData: Record<string, string>;
  updateField: (key: string, value: string) => void;
}

export function AdminCodesTab({ formData, updateField }: AdminCodesTabProps) {
  return (
    <div className="space-y-8">
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-blue-500">
        <SectionHeader
          icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
          title="إعدادات الإحالة العامة"
        />
        <CardContent className="p-6">
          <div className="max-w-md space-y-3">
            <FieldLabel hint="نسبة الخصم التي تُطبق على أكواد الإحالة الافتراضية. يُقرأ من promo_code_discount في referral-router.ts">
              نسبة الخصم لرمز الإحالة الأساسي (%)
            </FieldLabel>
            <div className="relative">
              <Input
                type="number"
                dir="ltr"
                min={1}
                max={100}
                className="font-mono text-lg py-6 bg-slate-50 dark:bg-slate-900"
                value={formData.promo_code_discount || ""}
                onChange={(e) =>
                  updateField("promo_code_discount", e.target.value)
                }
              />
              <span className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                %
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <DiscountCodesManager />
    </div>
  );
}
