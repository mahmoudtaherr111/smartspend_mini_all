import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export function RoutingRangesEditor({
  planName,
  rawValue,
  onChange,
  models,
}: {
  planName: string;
  rawValue: string;
  onChange: (val: string) => void;
  models: any[];
}) {
  let initialRanges: any[] = [];
  try {
    initialRanges = JSON.parse(rawValue || "[]");
  } catch (e) {}
  const [ranges, setRanges] = useState<any[]>(initialRanges);
  useEffect(() => {
    try {
      setRanges(JSON.parse(rawValue || "[]"));
    } catch (e) {}
  }, [rawValue]);

  const updateRange = (index: number, key: string, value: any) => {
    const newRanges = [...ranges];
    newRanges[index][key] = value;
    setRanges(newRanges);
    onChange(JSON.stringify(newRanges));
  };
  const addRange = () => {
    const newRanges = [
      ...ranges,
      {
        from: 0,
        to: null,
        provider: "gemini",
        key_slot: "key1",
        model: "gemini-2.0-flash",
      },
    ];
    setRanges(newRanges);
    onChange(JSON.stringify(newRanges));
  };
  const removeRange = (index: number) => {
    const newRanges = ranges.filter((_, i) => i !== index);
    setRanges(newRanges);
    onChange(JSON.stringify(newRanges));
  };

  return (
    <div className="space-y-4">
      {ranges.map((r, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-950 p-4 rounded-xl border dark:border-slate-800 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 text-sm font-bold text-slate-600">
              {i + 1}
            </span>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">من (Tokens)</Label>
              <Input
                type="number"
                dir="ltr"
                className="w-24 h-9 font-mono bg-slate-50 dark:bg-slate-900"
                value={r.from || 0}
                onChange={(e) => updateRange(i, "from", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">إلى (Tokens)</Label>
              <Input
                type="number"
                dir="ltr"
                className="w-24 h-9 font-mono bg-slate-50 dark:bg-slate-900"
                value={r.to || ""}
                placeholder="لانهائي"
                onChange={(e) =>
                  updateRange(
                    i,
                    "to",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </div>
          </div>

          <div className="flex-1 min-w-[200px] flex items-center gap-3 border-r pe-3 dark:border-slate-800">
            <div className="space-y-1 w-28">
              <Label className="text-[10px] text-slate-500">الإجراء</Label>
              <Select
                value={r.action || "route"}
                onValueChange={(v) =>
                  updateRange(i, "action", v === "route" ? undefined : v)
                }
              >
                <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="route">استخدام موديل</SelectItem>
                  <SelectItem value="block">حظر فوري</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {r.action === "block" ? (
              <div className="space-y-1 flex-1">
                <Label className="text-[10px] text-slate-500">
                  رسالة الحظر للعميل
                </Label>
                <Input
                  className="h-9 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 border-rose-200"
                  placeholder="عفواً، لقد استنفدت رصيدك..."
                  value={r.message || ""}
                  onChange={(e) => updateRange(i, "message", e.target.value)}
                />
              </div>
            ) : (
              <>
                <div className="space-y-1 w-24">
                  <Label className="text-[10px] text-slate-500">الخادم</Label>
                  <Select
                    value={r.provider || "gemini"}
                    onValueChange={(v) => {
                      updateRange(i, "provider", v);
                      updateRange(i, "model", ""); // Clear model when provider changes
                    }}
                  >
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Google</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                      <SelectItem value="fireworks">Fireworks</SelectItem>
                      <SelectItem value="nvidia">NVIDIA NIM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-[10px] text-slate-500">
                    الموديل الفعلي
                  </Label>
                  <Select
                    value={r.model || ""}
                    onValueChange={(v) => updateRange(i, "model", v)}
                  >
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models
                        .filter((m) =>
                          r.provider === "groq"
                            ? m.provider === "groq"
                            : r.provider === "fireworks"
                              ? m.provider === "fireworks"
                              : r.provider === "nvidia"
                                ? m.provider === "nvidia"
                                : m.provider === "gemini",
                        )
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center justify-between gap-2 w-full text-right">
                              <span>{m.name}</span>
                              {m.pricing && (
                                <span className="text-[10px] text-muted-foreground bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  {m.pricing}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-[10px] text-slate-500">
                    مفتاح API
                  </Label>
                  <Select
                    value={r.key_slot || "key1"}
                    onValueChange={(v) => updateRange(i, "key_slot", v)}
                  >
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="key1">🔑 Gemini Primary</SelectItem>
                      <SelectItem value="key2">🔑 Gemini Backup</SelectItem>
                      <SelectItem value="groq">🔑 Groq Key</SelectItem>
                      <SelectItem value="fireworks">🔑 Fireworks Key</SelectItem>
                      <SelectItem value="nvidia">🔑 NVIDIA Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 self-end mb-0.5"
            onClick={(e) => {
              e.preventDefault();
              removeRange(i);
            }}
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-dashed border-2 hover:bg-slate-50 w-full justify-center h-14 text-slate-500 font-bold bg-white dark:bg-slate-950 dark:border-slate-800"
        onClick={(e) => {
          e.preventDefault();
          addRange();
        }}
      >
        <Plus className="w-5 h-5" /> إضافة شريحة استهلاك توكنز جديدة
      </Button>
    </div>
  );
}
