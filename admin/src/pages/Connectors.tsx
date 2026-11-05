import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleHelp, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@admin/kit/badge";
import { Button } from "@admin/kit/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@admin/kit/dialog";
import { Input } from "@admin/kit/input";
import { Label } from "@admin/kit/label";
import { Switch } from "@admin/kit/switch";
import { trpc } from "@admin/lib/trpc";
import { AI_ROUTED_PURPOSES } from "@contracts/ai-models";
import { Confirm } from "../ui/Confirm";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { day, dayTime, usd } from "../ui/words";

type Protocol = "openai" | "gemini" | "anthropic";

// Services the console knows how to reach; "other" takes any OpenAI-compatible address.
const SERVICES: { slug: string; name: string; baseUrl: string; protocol: Protocol; keyHint: string }[] = [
  { slug: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", protocol: "gemini", keyHint: "من aistudio.google.com" },
  { slug: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", protocol: "openai", keyHint: "من openrouter.ai/keys" },
  { slug: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", protocol: "openai", keyHint: "من console.groq.com" },
  { slug: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", protocol: "openai", keyHint: "من platform.deepseek.com" },
  { slug: "fireworks", name: "Fireworks", baseUrl: "https://api.fireworks.ai/inference/v1", protocol: "openai", keyHint: "من fireworks.ai" },
  { slug: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", protocol: "openai", keyHint: "من build.nvidia.com" },
];

const PURPOSE = Object.fromEntries(AI_ROUTED_PURPOSES.map((p) => [p.id, p.label])) as Record<string, string>;

function Health({ status, checkedAt }: { status: string | null; checkedAt: string | Date | null }) {
  if (status === "healthy")
    return <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden />شغال · آخر فحص {dayTime(checkedAt)}</span>;
  if (status === "down" || status === "degraded")
    return <span className="inline-flex items-center gap-1 text-sm text-red-700 dark:text-red-400"><XCircle className="size-4" aria-hidden />مش بيرد · آخر فحص {dayTime(checkedAt)}</span>;
  return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><CircleHelp className="size-4" aria-hidden />ما اتفحصش لسه</span>;
}

/** The AI services the app talks to: add one with its key, test it, pause it, replace its key, or remove it. */
export function Connectors() {
  const utils = trpc.useUtils();
  const providers = trpc.admin.getAiProviders.useQuery();
  const models = trpc.admin.getAiModels.useQuery();
  const errors = trpc.admin.getApiKeyErrors.useQuery({ unresolvedOnly: true, limit: 20 });
  const refresh = () => {
    void utils.admin.getAiProviders.invalidate();
    void utils.admin.getAiModels.invalidate();
    void utils.admin.getApiKeyErrors.invalidate();
  };
  const failed = (error: { message: string }) => toast.error(error.message);
  const health = trpc.admin.checkProviderHealth.useMutation({ onSuccess: () => { toast.success("خلص الفحص"); refresh(); }, onError: failed });
  const update = trpc.admin.updateAiProvider.useMutation({ onSuccess: () => { toast.success("اتحفظ"); refresh(); }, onError: failed });
  const remove = trpc.admin.deleteAiProvider.useMutation({ onSuccess: () => { toast.success("الموصل اتشال"); setRemoving(null); refresh(); }, onError: failed });
  const resolveError = trpc.admin.resolveApiKeyError.useMutation({ onSuccess: refresh, onError: failed });

  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<{ id: number; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);

  return (
    <div>
      <PageHeader
        title="الموصلات"
        description="خدمات الذكاء اللي التطبيق بيكلمها، ومفتاح كل واحدة. التطبيق بيجرب الموصلات بالترتيب، ولو واحد وقع بيروح للي بعده."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => health.mutate()} disabled={health.isPending}>
              {health.isPending ? "بيفحص…" : "افحص الكل دلوقتي"}
            </Button>
            <Button onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />ضيف موصل</Button>
          </div>
        }
      />

      {(errors.data?.length ?? 0) > 0 && (
        <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="font-bold">أخطاء مفاتيح لسه ما اتحلتش</h2>
          <ul className="mt-2 divide-y text-sm">
            {errors.data!.map((error: { id: number; provider: string; message: string | null; createdAt: string | Date }) => (
              <li key={error.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><b>{error.provider}</b> · {error.message?.slice(0, 120)} · {dayTime(error.createdAt)}</span>
                <Button size="sm" variant="outline" onClick={() => resolveError.mutate({ errorId: error.id })}>اتحلت</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {providers.isLoading ? (
        <Loading />
      ) : !providers.data ? (
        <LoadError message="ماقدرناش نجيب الموصلات." onRetry={() => providers.refetch()} />
      ) : providers.data.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-semibold">لسه مفيش موصلات</p>
          <p className="mt-1 text-sm text-muted-foreground">من غير موصل، التطبيق بيستخدم مفتاح Gemini اللي في إعدادات السيرفر بس.</p>
          <Button className="mt-4" onClick={() => setAdding(true)}>ضيف أول موصل</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.data.map((provider, index) => {
            const own = (models.data ?? []).filter((model) => model.providerId === provider.id);
            return (
              <section key={provider.id} className="rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold">
                      {index + 1}. {provider.displayName}
                      {!provider.isActive && <Badge variant="outline" className="ms-2">موقوف</Badge>}
                    </h2>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <Health status={provider.healthStatus} checkedAt={provider.lastHealthCheck} />
                      <span>المفتاح: <span dir="ltr">{provider.apiKeyMasked}</span></span>
                      <span>اتضاف {day(provider.createdAt)}</span>
                    </div>
                    {(provider.keyState === "unreadable" || provider.keyState === "empty") && (
                      <p className="mt-2 text-sm text-red-700 dark:text-red-400">
                        {provider.keyState === "empty" ? "مفيش مفتاح متسجل للموصل ده." : "المفتاح ده مش مقروء، لازم يتدخل تاني."}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={provider.isActive} onCheckedChange={(isActive) => update.mutate({ id: provider.id, isActive })} />
                      {provider.isActive ? "شغال" : "موقوف"}
                    </label>
                    <Button size="sm" variant="outline" onClick={() => setReplacing({ id: provider.id, name: provider.displayName })}>غيّر المفتاح</Button>
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setRemoving({ id: provider.id, name: provider.displayName })}>شيل</Button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-sm font-semibold">الموديلات المفعّلة ({own.length})</div>
                  {own.length === 0 ? (
                    <p className="text-sm text-muted-foreground">مفيش موديلات متحددة للموصل ده، فمش هيستخدم في أي حاجة لحد ما تحدد. <Link className="underline" to="/legacy">حدد الموديلات</Link></p>
                  ) : (
                    <ul className="mt-1 divide-y text-sm">
                      {own.map((model) => {
                        const purposes = Array.isArray(model.purposes) ? (model.purposes as string[]) : [];
                        return (
                          <li key={model.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <span dir="ltr">{model.displayName || model.modelId}</span>
                            <span className="text-xs text-muted-foreground">
                              {purposes.map((p) => PURPOSE[p] ?? p).join("، ") || "مالوش استخدام"}
                              {model.isDefaultForPurpose ? " · الأساسي" : " · احتياطي"}
                              {" · "}دخول {usd(model.inputPricePer1M)} وخروج {usd(model.outputPricePer1M)} لكل مليون توكن
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AddConnector open={adding} onOpenChange={setAdding} onAdded={refresh} />
      <ReplaceKey target={replacing} onClose={() => setReplacing(null)} onSaved={refresh} />
      <Confirm
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="شيل الموصل"
        confirmLabel="شيل"
        danger
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate({ id: removing.id })}
      >
        <p>«{removing?.name}» وموديلاته هيتشالوا، والتطبيق مش هيكلمه تاني. لو هو الوحيد لوظيفة معينة، الوظيفة دي هترجع لمفتاح السيرفر.</p>
      </Confirm>
    </div>
  );
}

function AddConnector({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; onAdded: () => void }) {
  const [service, setService] = useState(SERVICES[0]);
  const [custom, setCustom] = useState({ name: "", baseUrl: "" });
  const [key, setKey] = useState("");
  const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
  const isOther = service.slug === "other";
  const target = isOther
    ? { slug: custom.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom", displayName: custom.name, baseUrl: custom.baseUrl, protocol: "openai" as Protocol }
    : { slug: service.slug, displayName: service.name, baseUrl: service.baseUrl, protocol: service.protocol };
  const validate = trpc.admin.validateApiKey.useMutation({
    onSuccess: (result) => setTested({ ok: !!result.valid, message: result.message }),
    onError: (error) => setTested({ ok: false, message: error.message }),
  });
  const add = trpc.admin.addAiProvider.useMutation({
    onSuccess: () => {
      toast.success("الموصل اتضاف");
      onAdded();
      onOpenChange(false);
      setKey("");
      setTested(null);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="text-start">
        <DialogHeader className="text-start"><DialogTitle>ضيف موصل</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>الخدمة</Label>
            <div className="flex flex-wrap gap-2">
              {[...SERVICES, { slug: "other", name: "خدمة تانية", baseUrl: "", protocol: "openai" as Protocol, keyHint: "" }].map((option) => (
                <Button key={option.slug} type="button" size="sm" variant={service.slug === option.slug ? "default" : "outline"} onClick={() => { setService(option); setTested(null); }}>
                  {option.name}
                </Button>
              ))}
            </div>
          </div>
          {isOther && (
            <>
              <div className="space-y-1.5"><Label htmlFor="c-name">الاسم</Label><Input id="c-name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="c-url">عنوان الخدمة (متوافق مع OpenAI)</Label><Input id="c-url" dir="ltr" placeholder="https://…/v1" value={custom.baseUrl} onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })} /></div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="c-key">المفتاح</Label>
            <Input id="c-key" dir="ltr" type="password" autoComplete="off" value={key} onChange={(e) => { setKey(e.target.value); setTested(null); }} />
            {!isOther && <p className="text-xs text-muted-foreground">بتجيبه {service.keyHint}. بيتحفظ متشفّر، ومحدش يقدر يشوفه تاني.</p>}
          </div>
          {tested && <p className={`text-sm ${tested.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{tested.message}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            disabled={!key || !target.baseUrl || validate.isPending}
            variant="outline"
            onClick={() => validate.mutate({ provider: target.slug, apiKey: key, baseUrl: target.baseUrl, protocol: target.protocol === "anthropic" ? undefined : target.protocol })}
          >
            {validate.isPending ? "بيجرب…" : "جرّب المفتاح"}
          </Button>
          <Button disabled={!tested?.ok || add.isPending} onClick={() => add.mutate({ ...target, apiKey: key, priority: 10 })}>
            ضيف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceKey({ target, onClose, onSaved }: { target: { id: number; name: string } | null; onClose: () => void; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const update = trpc.admin.updateAiProvider.useMutation({
    onSuccess: () => {
      toast.success("المفتاح اتغير");
      setKey("");
      onSaved();
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="text-start">
        <DialogHeader className="text-start"><DialogTitle>مفتاح جديد لـ{target?.name}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-key">المفتاح الجديد</Label>
          <Input id="new-key" dir="ltr" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          <p className="text-xs text-muted-foreground">القديم بيتشال أول ما تحفظ. افحص الموصل بعدها تتأكد إنه شغال.</p>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button disabled={!key || update.isPending} onClick={() => target && update.mutate({ id: target.id, apiKey: key })}>احفظ</Button>
          <Button variant="outline" onClick={onClose}>رجوع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
