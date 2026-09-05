import React, { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Sparkles, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function AiRuleSandboxTab() {
  const [testText, setTestText] = useState("دفعت 450 جنيه حساب المطعم");
  const [analysis, setAnalysis] = useState<any | null>(null);

  const parseMutation = trpc.ai.parseExpense.useMutation({
    onSuccess: (data) => {
      const rawData = data as any;
      const item = data.items?.[0];
      const trace = rawData.trace || {};

      setAnalysis({
        text: testText,
        category: item?.category || "متنوعات",
        subCategory: item?.subCategory || "عام",
        amount: item?.amount || 0,
        merchant: item?.merchant || "",
        parsedBy: data.parsedBy || "rule_engine",
        finalConfidence: Math.round(data.overallConfidence || item?.confidence || 0),
        decision: data.decision === "auto_save" ? "حفظ تلقائي (Auto-Save)" : data.decision === "review" ? "مراجعة يدوية (Review)" : "سؤال توضيحي (Clarify)",
        rawTrace: trace,
        rawItems: data.items,
      });
      toast.success("تم تحليل العبارة بنجاح بواسطة محرك القواعد الحقيقي!");
    },
    onError: (err) => {
      toast.error(`فشل التحليل: ${err.message}`);
    },
  });

  const handleRunRealTest = () => {
    const text = testText.trim();
    if (!text) return;
    parseMutation.mutate({ text, skipClarification: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-indigo-400" />
          مختبر وفاحص محرك القواعد بالعامية المصرية (Rule Engine NLP Sandbox)
        </h2>
        <p className="text-xs text-slate-400">
          اختبر دقة تمييز اللهجة المصرية، حالات النفي، الكلمات المشتركة (نور، كريم، مشروع)، ومعادلة الثقة الاحتمالية
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Card */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-md">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-200">جملة الاختبار بالعامية</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              جرب عبارات نفي، فواتير، أو كلمات مشتركة لاختبار المعادلة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="اكتب المعاملة بالعامية هنا..."
              rows={4}
              className="bg-slate-950 border-slate-800 text-sm leading-relaxed"
            />

            {/* Quick Preset Buttons */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 font-semibold">أمثلة سريعة للاختبار:</span>
              <div className="flex flex-wrap gap-2 text-xs">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTestText("دفعت 450 جنيه حساب المطعم")}
                  className="text-[11px] border-slate-800 bg-slate-950 hover:bg-slate-800"
                >
                  دفعت حساب المطعم (غير غامضة)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTestText("صاحبي عزمني على غدا ومادفعتش مليم")}
                  className="text-[11px] border-slate-800 bg-slate-950 hover:bg-slate-800 text-amber-300"
                >
                  عزومة ونفي (مادفعتش)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTestText("ركبت المشروع لمحطة مصر بـ 15 جنيه")}
                  className="text-[11px] border-slate-800 bg-slate-950 hover:bg-slate-800 text-sky-300"
                >
                  مشروع إسكندرية (مواصلات)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTestText("دفعت فاتورة النت 350 جنيه")}
                  className="text-[11px] border-slate-800 bg-slate-950 hover:bg-slate-800 text-emerald-300"
                >
                  فاتورة نت
                </Button>
              </div>
            </div>

            <Button
              onClick={handleRunRealTest}
              disabled={parseMutation.isPending || !testText.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
            >
              <RefreshCw className={`w-4 h-4 ml-1.5 ${parseMutation.isPending ? "animate-spin" : ""}`} />
              {parseMutation.isPending ? "جاري التحليل بواسطة الـ Backend..." : "اختبار وتحليل العبارة الحقيقية"}
            </Button>
          </CardContent>
        </Card>

        {/* Results & Factor Breakdown */}
        <Card className="bg-slate-900/70 border-slate-800 shadow-md">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-200">نتائج الفحص والتحليل الفعلي</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              مخرجات محرك القواعد والـ Smart Pipeline في السيرفر
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!analysis ? (
              <div className="py-12 text-center text-xs text-slate-500">
                اضغط "اختبار وتحليل العبارة الحقيقية" لعرض مخرجات السيرفر
              </div>
            ) : (
              <div className="space-y-4">
                {/* Result Header */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">التصنيف الناتج:</div>
                    <div className="text-base font-bold text-slate-100 flex items-center gap-2 mt-0.5">
                      <span>{analysis.category}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-indigo-400">{analysis.subCategory}</span>
                    </div>
                  </div>

                  <div className="text-left">
                    <div className="text-xs text-slate-400">درجة الثقة النهائية:</div>
                    <div
                      className={`text-2xl font-black font-mono ${
                        analysis.finalConfidence >= 85
                          ? "text-emerald-400"
                          : analysis.finalConfidence >= 60
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {analysis.finalConfidence}%
                    </div>
                  </div>
                </div>

                {/* Entity & Metadata Breakdown */}
                <div className="space-y-2 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <div className="font-semibold text-slate-300 pb-1 border-b border-slate-800 flex justify-between">
                    <span>الكيانات المستخرجة (Extracted Entities)</span>
                    <Badge variant="outline" className="text-[10px] border-slate-700 font-mono">
                      {analysis.parsedBy}
                    </Badge>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">المبلغ المستخرج:</span>
                    <span className="font-mono font-bold text-amber-400">
                      {analysis.amount > 0 ? `${analysis.amount} ج.م` : "غير محدد"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">التاجر / الجهة:</span>
                    <span className="font-mono font-bold text-slate-200">
                      {analysis.merchant || "غير محدد"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-t border-slate-800/80 pt-1.5">
                    <span className="text-slate-400">طريقة المعالجة (Pipeline Route):</span>
                    <span className="font-mono text-indigo-400 font-semibold">
                      {analysis.parsedBy === "rule_engine" ? "محرك القواعد الفوري (Rule Engine - 0 Tokens)" : analysis.parsedBy}
                    </span>
                  </div>
                </div>

                {/* Decision Badge */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-400">القرار التلقائي للنظام:</span>
                  <Badge
                    className={
                      analysis.finalConfidence >= 85
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : analysis.finalConfidence >= 60
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }
                  >
                    {analysis.decision}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
