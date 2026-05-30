import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export function ClarificationsTab() {
  const { data: clarifications, isLoading, refetch } =
    trpc.admin.getPendingClarifications.useQuery();

  const resolveMutation = trpc.admin.resolveClarification.useMutation({
    onSuccess: () => {
      toast.success("تم التحديث بنجاح");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "حدث خطأ أثناء التحديث");
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center">جاري التحميل...</div>;
  }

  const pendingList = clarifications?.filter((c) => c.status === "pending") || [];
  const resolvedList =
    clarifications?.filter((c) => c.status !== "pending") || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>التوضيحات المعلقة (Pending Clarifications)</CardTitle>
          <CardDescription>
            هنا تظهر التوضيحات التي طلبها النظام من المستخدمين ولم يتم حسمها بعد
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingList.length === 0 ? (
            <div className="text-center p-8 text-slate-500">
              لا توجد توضيحات معلقة حالياً.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingList.map((item) => (
                <div
                  key={item.id}
                  className="p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-lg">{item.originalText}</span>
                      <p className="text-sm text-slate-500">
                        {new Date(item.createdAt).toLocaleString("ar-EG")}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700">
                      معلق
                    </Badge>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm">
                      <span className="font-bold">سؤال النظام:</span>{" "}
                      {item.clarificationQuestion}
                    </p>
                    {item.userAnswer && (
                      <p className="text-sm text-indigo-700 dark:text-indigo-400 mt-1">
                        <span className="font-bold">إجابة المستخدم:</span>{" "}
                        {item.userAnswer}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() =>
                        resolveMutation.mutate({
                          id: item.id,
                          status: "resolved",
                        })
                      }
                      disabled={resolveMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4" /> تحديد كمحلول
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() =>
                        resolveMutation.mutate({ id: item.id, status: "ignored" })
                      }
                      disabled={resolveMutation.isPending}
                    >
                      <XCircle className="w-4 h-4" /> تجاهل
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {resolvedList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>التوضيحات السابقة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {resolvedList.map((item) => (
                <div
                  key={item.id}
                  className="p-4 border rounded-xl bg-white dark:bg-slate-950 opacity-70"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-sm">
                        {item.originalText}
                      </span>
                      <p className="text-xs text-slate-500">
                        {item.userAnswer
                          ? `إجابة: ${item.userAnswer}`
                          : "بدون إجابة"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        item.status === "resolved"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-50 text-slate-700"
                      }
                    >
                      {item.status === "resolved" ? "محلول" : "متجاهل"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
