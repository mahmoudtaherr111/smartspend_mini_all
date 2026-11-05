import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AI_PLAN_TIERS, AI_ROUTED_PURPOSES } from "@contracts/ai-models";
import { Button } from "@admin/kit/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@admin/kit/dialog";
import { Input } from "@admin/kit/input";
import { Label } from "@admin/kit/label";
import { Switch } from "@admin/kit/switch";
import { trpc } from "@admin/lib/trpc";
import { PLAN } from "../../ui/words";

export interface ModelForm {
  id?: number;
  providerId: number;
  modelId: string;
  displayName: string;
  purposes: string[];
  allowedTiers: string[];
  inputPricePer1M: string;
  outputPricePer1M: string;
  cachedPricePer1M: string;
  supportsReasoning: boolean;
  isActive: boolean;
}

export const emptyModel = (providerId: number, purposes: string[] = []): ModelForm => ({
  providerId,
  modelId: "",
  displayName: "",
  purposes,
  allowedTiers: [...AI_PLAN_TIERS],
  inputPricePer1M: "",
  outputPricePer1M: "",
  cachedPricePer1M: "",
  supportsReasoning: false,
  isActive: true,
});

type Rates = Record<string, { input: number; output: number; cached?: number }>;
type Connector = { id: number; displayName: string; protocol: string };

function Chips({ options, value, onChange }: { options: { id: string; label: string }[]; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value.includes(option.id);
        return (
          <Button key={option.id} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((item) => item !== option.id) : [...value, option.id])}>
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Adds a model to a connector or edits one: what it is called, what it does for which plans, and what it costs. */
export function ModelDialog({ form, connectors, rates, onClose, onSaved }: {
  form: ModelForm | null;
  connectors: Connector[];
  rates: Rates;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ModelForm | null>(form);
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { setDraft(form); setFound([]); }, [form]);
  const discover = trpc.aiSetup.discover.useMutation({
    onSuccess: (result) => { setFound(result.models); toast.success(`لقينا ${result.models.length} موديل`); },
    onError: (error) => toast.error(error.message),
  });
  const save = trpc.aiSetup.saveModel.useMutation({
    onSuccess: () => { toast.success("اتحفظ، وبيوصل لكل السيرفرات خلال ثواني"); onSaved(); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  if (!draft) return null;
  const connector = connectors.find((item) => item.id === draft.providerId);
  const set = (patch: Partial<ModelForm>) => setDraft({ ...draft, ...patch });
  const pickModel = (modelId: string) => {
    const known = rates[modelId.replace(/^models\//, "")];
    const name = found.find((item) => item.id === modelId)?.name;
    set({
      modelId,
      displayName: draft.displayName || name || modelId,
      ...(known && !draft.inputPricePer1M ? { inputPricePer1M: String(known.input), outputPricePer1M: String(known.output), cachedPricePer1M: String(known.cached ?? known.input) } : {}),
    });
  };
  const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
  const prices = [number(draft.inputPricePer1M), number(draft.outputPricePer1M), number(draft.cachedPricePer1M || draft.inputPricePer1M)];
  const pricesOk = prices.every((value) => Number.isFinite(value) && value >= 0);
  const ready = draft.modelId.trim() && draft.displayName.trim() && draft.allowedTiers.length > 0 && pricesOk;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto text-start">
        <DialogHeader className="text-start"><DialogTitle>{draft.id ? "تعديل موديل" : "موديل جديد"} · {connector?.displayName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-id">اسم الموديل عند الخدمة</Label>
            <div className="flex gap-2">
              <Input id="m-id" dir="ltr" list="m-found" disabled={!!draft.id} placeholder={connector?.protocol === "anthropic" ? "claude-haiku-5-5" : "gemini-3.5-flash-lite"} value={draft.modelId} onChange={(e) => pickModel(e.target.value)} />
              {!draft.id && (
                <Button type="button" variant="outline" disabled={discover.isPending} onClick={() => discover.mutate({ providerId: draft.providerId })}>
                  {discover.isPending ? "بيجيب…" : "هات القايمة"}
                </Button>
              )}
            </div>
            <datalist id="m-found">{found.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</datalist>
            <p className="text-xs text-muted-foreground">«هات القايمة» بتسأل الخدمة بمفتاح الموصل عن الموديلات اللي يقدر يوصلها.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-name">الاسم اللي يظهر هنا</Label>
            <Input id="m-name" value={draft.displayName} onChange={(e) => set({ displayName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>بيشتغل في</Label>
            <Chips options={AI_ROUTED_PURPOSES.map((item) => ({ id: item.id, label: item.label }))} value={draft.purposes} onChange={(purposes) => set({ purposes })} />
            {draft.purposes.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-400">من غير وظيفة، الموديل محفوظ بس محدش بيسأله.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>للباقات</Label>
            <Chips options={AI_PLAN_TIERS.map((tier) => ({ id: tier, label: PLAN[tier] ?? tier }))} value={draft.allowedTiers} onChange={(allowedTiers) => set({ allowedTiers })} />
          </div>
          <div className="space-y-1.5">
            <Label>السعر بالدولار لكل مليون توكن</Label>
            <div className="grid grid-cols-3 gap-2">
              {([["inputPricePer1M", "الدخول"], ["outputPricePer1M", "الخروج"], ["cachedPricePer1M", "الدخول المتخزن"]] as const).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs">
                  <span>{label}</span>
                  <Input dir="ltr" inputMode="decimal" value={draft[key]} onChange={(e) => set({ [key]: e.target.value.replace(/[^\d.]/g, "") } as Partial<ModelForm>)} />
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">لو الموديل معروف، السعر بيتملي من الأسعار المنشورة. التكلفة في «مكالمات الذكاء» بتتحسب منه.</p>
          </div>
          {connector?.protocol === "openai" && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">موديل بيفكر قبل ما يرد</div>
                <div className="text-xs text-muted-foreground">زي DeepSeek R1 وQwen. السيرفر بيطلب منه مايكتبش تفكيره، عشان الرد مايتقطعش.</div>
              </div>
              <Switch checked={draft.supportsReasoning} aria-label="موديل بيفكر" onCheckedChange={(supportsReasoning) => set({ supportsReasoning })} />
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">شغال</div>
            <Switch checked={draft.isActive} aria-label="الموديل شغال" onCheckedChange={(isActive) => set({ isActive })} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button disabled={!ready || save.isPending} onClick={() => save.mutate({
            id: draft.id,
            providerId: draft.providerId,
            modelId: draft.modelId.trim(),
            displayName: draft.displayName.trim(),
            purposes: draft.purposes as never,
            allowedTiers: draft.allowedTiers as never,
            inputPricePer1M: prices[0],
            outputPricePer1M: prices[1],
            cachedPricePer1M: prices[2],
            supportsReasoning: draft.supportsReasoning,
            isActive: draft.isActive,
          })}>احفظ</Button>
          <Button variant="outline" onClick={onClose}>رجوع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
