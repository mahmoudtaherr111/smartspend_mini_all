import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@admin/kit/badge";
import { Button } from "@admin/kit/button";
import { Switch } from "@admin/kit/switch";
import { trpc } from "@admin/lib/trpc";
import type { RouterOutputs } from "@admin/lib/trpc";
import { Confirm } from "../../ui/Confirm";
import { LoadError, Loading, PageHeader } from "../../ui/states";
import { PLAN, usd } from "../../ui/words";
import { emptyModel, ModelDialog, type ModelForm } from "./ModelDialog";
import { ServerKeys, SpeechToText } from "./SpeechAndKeys";

type Overview = RouterOutputs["aiSetup"]["overview"];
type Model = Overview["models"][number];

const PROTOCOL: Record<string, string> = { anthropic: "Claude", gemini: "Gemini", openai: "متوافق مع OpenAI" };

const formFor = (model: Model): ModelForm => ({
  id: model.id,
  providerId: model.providerId,
  modelId: model.modelId,
  displayName: model.displayName,
  purposes: model.purposes,
  allowedTiers: model.allowedTiers,
  inputPricePer1M: String(model.inputPricePer1M),
  outputPricePer1M: String(model.outputPricePer1M),
  cachedPricePer1M: String(model.cachedPricePer1M),
  supportsReasoning: model.supportsReasoning,
  isActive: model.isActive,
});

/** One real call to a model, with what it answered, how long it took and what it cost. */
function TestButton({ id }: { id: number }) {
  const test = trpc.aiSetup.test.useMutation({ onError: (error) => toast.error(error.message) });
  const result = test.data;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate({ id })}>{test.isPending ? "بيجرب…" : "جرّب"}</Button>
      {result && (result.ok
        ? <span className="text-xs text-emerald-700 dark:text-emerald-400">رد «{result.reply}» في {(result.latencyMs / 1000).toFixed(1)} ث · {usd(result.costUsd)}</span>
        : <span className="text-xs text-red-700 dark:text-red-400" title={"detail" in result ? result.detail : undefined}>{result.message}</span>)}
    </span>
  );
}

function Routes({ data, onEdit }: { data: Overview; onEdit: (form: ModelForm) => void }) {
  const utils = trpc.useUtils();
  const reorder = trpc.aiSetup.reorder.useMutation({
    onSuccess: () => { toast.success("الترتيب اتحفظ"); void utils.aiSetup.overview.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const byId = new Map(data.models.map((model) => [model.id, model]));
  const connector = new Map(data.connectors.map((item) => [item.id, item]));
  const [adding, setAdding] = useState<string | null>(null);
  const save = trpc.aiSetup.saveModel.useMutation({
    onSuccess: () => { toast.success("اتضاف"); setAdding(null); void utils.aiSetup.overview.invalidate(); },
    onError: (error) => toast.error(error.message),
  });

  if (data.models.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-semibold">لسه مفيش موديلات</p>
        <p className="mt-1 text-sm text-muted-foreground">ضيف موصل الأول (Claude أو Gemini أو غيرهم)، وبعدين ضيف موديلاته من تبويب «الموديلات».</p>
        <Button className="mt-4" asChild><Link to="/ai/connectors">روح للموصلات</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        في كل وظيفة، أول موديل هو اللي بيرد. لو وقع أو اتأخر، اللي بعده بياخد مكانه. الترتيب واحد في كل الوظايف: لو حطيت موديل فوق
        موديل في وظيفة، هيبقى فوقه في أي وظيفة تانية الاتنين فيها.
      </p>
      {data.routes.map((route) => {
        const outside = data.models.filter((model) => model.reachable && !model.purposes.includes(route.purpose));
        return (
          <section key={route.purpose} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">{route.label}</h2>
              {outside.length > 0 && (
                <div className="flex items-center gap-2">
                  {adding === route.purpose ? (
                    <>
                      <select aria-label="اختار موديل" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue=""
                        onChange={(e) => {
                          const model = byId.get(Number(e.target.value));
                          if (model) save.mutate({ ...formFor(model), purposes: [...model.purposes, route.purpose] as never, allowedTiers: model.allowedTiers as never,
                            inputPricePer1M: model.inputPricePer1M, outputPricePer1M: model.outputPricePer1M, cachedPricePer1M: model.cachedPricePer1M });
                        }}>
                        <option value="" disabled>اختار موديل</option>
                        {outside.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {connector.get(model.providerId)?.displayName}</option>)}
                      </select>
                      <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>رجوع</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setAdding(route.purpose)}>ضيف موديل للوظيفة دي</Button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {route.tiers.map((slot) => (
                <div key={slot.tier} className="rounded-lg bg-muted/40 p-3">
                  <div className="mb-2 text-sm font-semibold">{PLAN[slot.tier] ?? slot.tier}</div>
                  {slot.modelIds.length === 0 ? (
                    slot.fallback.length ? (
                      <p className="text-sm text-muted-foreground">مفيش موديل هنا، فبيرد Gemini بمفتاح السيرفر: <span dir="ltr">{slot.fallback.join("، ")}</span>.</p>
                    ) : (
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">مفيش حاجة هترد هنا: مفيش موديل ولا مفتاح سيرفر.</p>
                    )
                  ) : (
                    <ol className="space-y-2">
                      {slot.modelIds.map((id, index) => {
                        const model = byId.get(id)!;
                        const move = (to: number) => {
                          const ids = [...slot.modelIds];
                          [ids[index], ids[to]] = [ids[to], ids[index]];
                          reorder.mutate({ purpose: route.purpose as never, tier: slot.tier, ids });
                        };
                        return (
                          <li key={id} className="rounded-md border bg-background p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold">{index + 1}. {model.displayName}{index === 0 && <Badge className="ms-2" variant="secondary">بيرد</Badge>}</div>
                                <div className="text-xs text-muted-foreground">{connector.get(model.providerId)?.displayName} · {usd(model.inputPricePer1M)} / {usd(model.outputPricePer1M)} للمليون</div>
                              </div>
                              <div className="flex shrink-0">
                                <Button size="icon" variant="ghost" aria-label="لفوق" disabled={index === 0 || reorder.isPending} onClick={() => move(index - 1)}><ArrowUp className="size-4" /></Button>
                                <Button size="icon" variant="ghost" aria-label="لتحت" disabled={index === slot.modelIds.length - 1 || reorder.isPending} onClick={() => move(index + 1)}><ArrowDown className="size-4" /></Button>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <TestButton id={id} />
                              <Button size="sm" variant="ghost" onClick={() => onEdit(formFor(model))}>عدّل</Button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Models({ data, onEdit }: { data: Overview; onEdit: (form: ModelForm) => void }) {
  const utils = trpc.useUtils();
  const refresh = () => void utils.aiSetup.overview.invalidate();
  const [removing, setRemoving] = useState<Model | null>(null);
  const save = trpc.aiSetup.saveModel.useMutation({ onSuccess: refresh, onError: (error) => toast.error(error.message) });
  const remove = trpc.aiSetup.removeModel.useMutation({ onSuccess: () => { toast.success("اتشال"); setRemoving(null); refresh(); }, onError: (error) => toast.error(error.message) });
  const purposeLabel = new Map<string, string>(data.routes.map((route) => [route.purpose, route.label]));

  if (data.connectors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-semibold">لسه مفيش موصلات</p>
        <Button className="mt-4" asChild><Link to="/ai/connectors">ضيف موصل</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.connectors.map((item) => {
        const own = data.models.filter((model) => model.providerId === item.id);
        return (
          <section key={item.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold">{item.displayName} <span className="text-xs font-normal text-muted-foreground">{PROTOCOL[item.protocol]}</span></h2>
                {!item.isActive && <p className="text-sm text-amber-700 dark:text-amber-400">الموصل موقوف، فموديلاته مش بترد.</p>}
                {(item.keyState === "unreadable" || item.keyState === "empty") && <p className="text-sm text-red-700 dark:text-red-400">مفتاح الموصل مش مقروء، فموديلاته مش بترد. دخّله تاني من الموصلات.</p>}
              </div>
              <Button size="sm" onClick={() => onEdit(emptyModel(item.id))}>ضيف موديل</Button>
            </div>
            {own.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">مفيش موديلات للموصل ده.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {own.map((model) => (
                  <li key={model.id} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{model.displayName} <span className="text-xs font-normal text-muted-foreground" dir="ltr">{model.modelId}</span></div>
                      <div className="text-xs text-muted-foreground">
                        {model.purposes.map((purpose) => purposeLabel.get(purpose) ?? purpose).join("، ") || "مالوش وظيفة"}
                        {" · "}{model.allowedTiers.map((tier) => PLAN[tier] ?? tier).join("، ")}
                        {" · "}{usd(model.inputPricePer1M)} / {usd(model.outputPricePer1M)} للمليون
                      </div>
                    </div>
                    <TestButton id={model.id} />
                    <Switch checked={model.isActive} aria-label={`تشغيل ${model.displayName}`}
                      onCheckedChange={(isActive) => save.mutate({ ...formFor(model), isActive, purposes: model.purposes as never, allowedTiers: model.allowedTiers as never,
                        inputPricePer1M: model.inputPricePer1M, outputPricePer1M: model.outputPricePer1M, cachedPricePer1M: model.cachedPricePer1M })} />
                    <Button size="sm" variant="outline" onClick={() => onEdit(formFor(model))}>عدّل</Button>
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setRemoving(model)}>شيل</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <Confirm open={!!removing} onOpenChange={(open) => !open && setRemoving(null)} title="شيل الموديل" confirmLabel="شيل" danger busy={remove.isPending}
        onConfirm={() => removing && remove.mutate({ id: removing.id })}>
        <p>«{removing?.displayName}» هيتشال من كل الوظايف. لو هو الوحيد في وظيفة، الوظيفة دي هترجع لمفتاح السيرفر.</p>
      </Confirm>
    </div>
  );
}

const TABS = [
  { id: "routes", label: "الوظايف" },
  { id: "models", label: "الموديلات" },
  { id: "speech", label: "تحويل الصوت لكلام" },
  { id: "keys", label: "مفاتيح السيرفر" },
] as const;

/** Which model answers each purpose for each plan, the models of each connector, and the settings no connector covers. */
export function AiSetup() {
  const [open, setOpen] = useState<(typeof TABS)[number]["id"]>("routes");
  const [editing, setEditing] = useState<ModelForm | null>(null);
  const utils = trpc.useUtils();
  const overview = trpc.aiSetup.overview.useQuery();

  return (
    <div>
      <PageHeader
        title="إعداد الذكاء"
        description="أنهي موديل بيرد في كل وظيفة لكل باقة، ومين ياخد مكانه لو وقع. اللي هنا هو اللي السيرفر بيشغّله فعلاً، وأي تغيير بيوصل لكل السيرفرات خلال ثواني."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((tab) => (
          <Button key={tab.id} size="sm" role="tab" aria-selected={open === tab.id} variant={open === tab.id ? "default" : "outline"} onClick={() => setOpen(tab.id)}>
            {tab.label}
          </Button>
        ))}
      </div>
      {(open === "routes" || open === "models") && (
        overview.isLoading ? <Loading /> : !overview.data ? <LoadError message="ماقدرناش نجيب إعداد الذكاء." onRetry={() => overview.refetch()} /> : (
          open === "routes" ? <Routes data={overview.data} onEdit={setEditing} /> : <Models data={overview.data} onEdit={setEditing} />
        )
      )}
      {open === "speech" && <SpeechToText />}
      {open === "keys" && <ServerKeys />}
      {overview.data && (
        <ModelDialog form={editing} connectors={overview.data.connectors} rates={overview.data.publishedRates} onClose={() => setEditing(null)}
          onSaved={() => void utils.aiSetup.overview.invalidate()} />
      )}
    </div>
  );
}
