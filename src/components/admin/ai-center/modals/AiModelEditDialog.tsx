/**
 * Edit one configured model: what it serves (the purposes the server reads from the admin's routes), for which plans,
 * whether it is the default for its purposes, whether it is active, and its price per million tokens. The price is
 * what the AI cost ledger charges for every call to it; the provider's published price can be filled in with one tap.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AI_PLAN_TIERS, AI_ROUTED_PURPOSES, PUBLISHED_RATES } from "@contracts/ai-models";

export interface EditableModel {
  id: number;
  providerId: number;
  modelId: string;
  displayName: string;
  purposes: unknown;
  allowedTiers: unknown;
  isDefaultForPurpose: boolean;
  isActive: boolean;
  inputPricePer1M: string | number;
  outputPricePer1M: string | number;
  cachedPricePer1M: string | number;
  maxContextTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
}

const asList = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

export function AiModelEditDialog({ model, onClose }: { model: EditableModel; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [purposes, setPurposes] = useState<string[]>(asList(model.purposes));
  const [tiers, setTiers] = useState<string[]>(asList(model.allowedTiers));
  const [isDefault, setIsDefault] = useState(model.isDefaultForPurpose);
  const [isActive, setIsActive] = useState(model.isActive);
  const [input, setInput] = useState(String(Number(model.inputPricePer1M)));
  const [output, setOutput] = useState(String(Number(model.outputPricePer1M)));
  const [cached, setCached] = useState(String(Number(model.cachedPricePer1M)));
  const published = PUBLISHED_RATES[model.modelId.replace(/^models\//, "")];

  const save = trpc.admin.saveAiModels.useMutation({
    onSuccess: () => {
      toast.success("اتحفظ الموديل");
      void utils.admin.getAiModels.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggle = (list: string[], set: (next: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  const price = (value: string) => Math.max(0, Number(value) || 0);
  const unpriced = price(input) === 0 && price(output) === 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-slate-950 text-slate-100 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-base">{model.displayName}</DialogTitle>
          <DialogDescription className="text-xs text-slate-400 font-mono">{model.modelId}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-xs">
          <div className="space-y-2">
            <Label className="text-slate-300">بيستخدم في إيه</Label>
            <div className="grid grid-cols-2 gap-2">
              {AI_ROUTED_PURPOSES.map((purpose) => (
                <label key={purpose.id} className="flex items-center gap-2 rounded border border-slate-800 p-2 cursor-pointer">
                  <input type="checkbox" checked={purposes.includes(purpose.id)} onChange={() => toggle(purposes, setPurposes, purpose.id)} />
                  {purpose.label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              الموديل اللي مالوش استخدام بيتحفظ ومابيتطلبش. الترتيب بين مزودين نفس الاستخدام من أولوية المزود.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">الباقات</Label>
            <div className="flex gap-2">
              {AI_PLAN_TIERS.map((tier) => (
                <label key={tier} className="flex items-center gap-2 rounded border border-slate-800 px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={tiers.includes(tier)} onChange={() => toggle(tiers, setTiers, tier)} />
                  {tier}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              الافتراضي لاستخداماته
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              شغال
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300">السعر لكل مليون توكن (دولار)</Label>
              {published && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-slate-700"
                  onClick={() => {
                    setInput(String(published.input));
                    setOutput(String(published.output));
                    setCached(String(published.cached ?? published.input));
                  }}
                >
                  سعر المزود المنشور
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500">إدخال</span>
                <Input type="number" min="0" step="0.0001" value={input} onChange={(e) => setInput(e.target.value)} className="h-8 bg-slate-900 border-slate-800 font-mono" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500">إخراج (والتفكير)</span>
                <Input type="number" min="0" step="0.0001" value={output} onChange={(e) => setOutput(e.target.value)} className="h-8 bg-slate-900 border-slate-800 font-mono" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500">إدخال من الكاش</span>
                <Input type="number" min="0" step="0.0001" value={cached} onChange={(e) => setCached(e.target.value)} className="h-8 bg-slate-900 border-slate-800 font-mono" />
              </div>
            </div>
            {unpriced && (
              <p className="text-[11px] text-amber-400">
                من غير سعر، كل مكالمة للموديل ده هتتسجل في سجل التكلفة على إنها «من غير سعر» ومش هتتحسب.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button type="button" variant="outline" className="border-slate-700" onClick={onClose}>إلغاء</Button>
            <Button
              type="button"
              disabled={save.isPending || tiers.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500"
              onClick={() =>
                save.mutate({
                  providerId: model.providerId,
                  models: [{
                    modelId: model.modelId,
                    displayName: model.displayName,
                    purposes,
                    allowedTiers: tiers,
                    isDefaultForPurpose: isDefault,
                    inputPricePer1M: price(input),
                    outputPricePer1M: price(output),
                    cachedPricePer1M: price(cached),
                    maxContextTokens: model.maxContextTokens ?? 128000,
                    supportsVision: Boolean(model.supportsVision),
                    supportsReasoning: Boolean(model.supportsReasoning),
                    isActive,
                  }],
                })
              }
            >
              حفظ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
