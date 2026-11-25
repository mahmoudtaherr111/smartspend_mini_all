import { Link } from "react-router-dom";
import { Badge } from "@admin/kit/badge";
import { Input } from "@admin/kit/input";
import { Switch } from "@admin/kit/switch";
import { trpc } from "@admin/lib/trpc";
import { SettingsEditor } from "../ui/SettingsEditor";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { STORE, SUBSCRIPTION, count, day, dayTime, word } from "../ui/words";

const PRODUCT: Record<string, string> = {
  pro_monthly: "Pro شهري",
  pro_yearly: "Pro سنوي",
  ultra_monthly: "Ultra شهري",
  pro: "Pro",
  ultra: "Ultra",
};

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="num mt-1 text-3xl font-bold">{value}</div>
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

/** Who pays, from which store, what that is worth a month, and store gateway switches. */
export function Money() {
  const money = trpc.adminConsole.money.useQuery();

  return (
    <div>
      <PageHeader
        title="الفلوس وبوابات المتاجر"
        description="اشتراكات الموبايل من Google Play وApp Store، المنح التجريبية اليدوية، والتحكم في بوابات الدفع."
      />
      {money.isLoading ? (
        <Loading />
      ) : !money.data ? (
        <LoadError
          message="ماقدرناش نجيب أرقام الاشتراكات."
          onRetry={() => money.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Figure
              label="إيراد شهري تقديري"
              value={`${count(money.data.monthlyRevenueEstimate)} ج.م`}
              note="بالسعر المعلن قبل نصيب المتجر (15% لأغلب الاشتراكات)."
            />
            {money.data.activeByStore.map((row) => (
              <Figure
                key={row.store}
                label={`مشتركين نشطين من ${word(STORE, row.store)}`}
                value={count(row.count)}
              />
            ))}
            <Figure
              label="منح وتجارب نشطة"
              value={count(money.data.activeManualGrants)}
              note="منح يدوية من الأدمن شغالة دلوقتي."
            />
            <Figure
              label="اشتركوا الشهر ده"
              value={count(money.data.newThisMonth)}
              note={`وخلص أو اترد اشتراك ${count(money.data.endedThisMonth)}`}
            />
          </div>

          <section className="mt-4 rounded-xl border bg-background p-4">
            <h2 className="font-bold">بوابات الدفع في الموبايل (Google Play & App Store)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              أندرويد بيدفع عبر Google Play وآيفون عبر App Store فقط. اقفل بوابة مؤقتًا لو بتعمل صيانة أو بتراجع الأسعار.
            </p>
            <div className="mt-3">
              <SettingsEditor>
                {({ formData, updateField }) => (
                  <div className="space-y-4">
                    <ul className="divide-y">
                      <li className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            <span>بوابة Google Play (أندرويد)</span>
                            <Badge variant={money.data.gateways.googlePlayConfigured ? "default" : "outline"}>
                              {money.data.gateways.googlePlayConfigured ? "مفاتيح السيرفر جاهزة" : "مفاتيح السيرفر ناقصة"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">يسمح لتطبيق الأندرويد بعرض الباقات وتأكيد الشراء واسترجاعه.</div>
                        </div>
                        <Switch
                          aria-label="بوابة Google Play"
                          checked={formData.store_google_play_enabled !== "false"}
                          onCheckedChange={(on) => updateField("store_google_play_enabled", String(on))}
                        />
                      </li>
                      <li className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            <span>بوابة App Store (آيفون)</span>
                            <Badge variant={money.data.gateways.appStoreConfigured ? "default" : "outline"}>
                              {money.data.gateways.appStoreConfigured ? "مفاتيح السيرفر جاهزة" : "مفاتيح السيرفر ناقصة"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">يسمح لتطبيق iOS بعرض الباقات وتأكيد الشراء بـ StoreKit 2 واسترجاعه.</div>
                        </div>
                        <Switch
                          aria-label="بوابة App Store"
                          checked={formData.store_app_store_enabled !== "false"}
                          onCheckedChange={(on) => updateField("store_app_store_enabled", String(on))}
                        />
                      </li>
                    </ul>
                    <label className="block border-t pt-3 space-y-1 text-sm">
                      <span className="font-semibold">سعر الدولار بالجنيه</span>
                      <Input
                        dir="ltr"
                        inputMode="decimal"
                        className="w-32"
                        value={formData.usd_to_egp_rate ?? ""}
                        onChange={(e) => updateField("usd_to_egp_rate", e.target.value.replace(/[^\d.]/g, ""))}
                      />
                      <span className="block text-xs text-muted-foreground">
                        تكلفة الذكاء الاصطناعي بالجنيه في «نداءات الذكاء» بتتحسب بيه. غيّره لما السعر يتغير.
                      </span>
                    </label>
                  </div>
                )}
              </SettingsEditor>
            </div>
          </section>

          <section className="mt-4 overflow-x-auto rounded-xl border bg-background">
            <div className="p-4 pb-2">
              <h2 className="font-bold">آخر اشتراكات المتاجر</h2>
              <p className="text-xs text-muted-foreground">
                الإلغاء بيتم من المتجر نفسه، والباقة بتفضل شغالة لحد آخر المدة المدفوعة.
              </p>
            </div>
            {money.data.latest.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">
                لسه محدش اشترك من المتاجر.
              </p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">مين</th>
                    <th className="px-4 py-2 text-start font-medium">الباقة</th>
                    <th className="px-4 py-2 text-start font-medium">المتجر</th>
                    <th className="px-4 py-2 text-start font-medium">الحالة</th>
                    <th className="px-4 py-2 text-start font-medium">لحد</th>
                    <th className="px-4 py-2 text-start font-medium">اشترك</th>
                  </tr>
                </thead>
                <tbody>
                  {money.data.latest.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-4 py-2">
                        <Link
                          to={`/people/${row.userType}/${row.userId}`}
                          className="hover:underline"
                        >
                          {row.who || "من غير اسم"}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        {PRODUCT[row.product] ?? row.product}
                      </td>
                      <td className="px-4 py-2">{word(STORE, row.store)}</td>
                      <td className="px-4 py-2">
                        {word(SUBSCRIPTION, row.status)}
                      </td>
                      <td className="px-4 py-2">{day(row.expiresAt)}</td>
                      <td className="px-4 py-2">{day(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <section className="overflow-x-auto rounded-xl border bg-background">
              <div className="p-4 pb-2">
                <h2 className="font-bold">المنح اليدوية والاشتراكات التانية</h2>
                <p className="text-xs text-muted-foreground">
                  الباقات والتجارب المفتوحة يدويًا من الأدمن لمستخدمين محددين، أو الاشتراكات القديمة.
                </p>
              </div>
              {money.data.manualGrants.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  مفيش منح يدوية متسجلة.
                </p>
              ) : (
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">مين</th>
                      <th className="px-4 py-2 text-start font-medium">الباقة</th>
                      <th className="px-4 py-2 text-start font-medium">المصدر</th>
                      <th className="px-4 py-2 text-start font-medium">الحالة</th>
                      <th className="px-4 py-2 text-start font-medium">لحد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {money.data.manualGrants.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-4 py-2">
                          <Link
                            to={`/people/${row.userType}/${row.userId}`}
                            className="hover:underline"
                          >
                            {row.who || "من غير اسم"}
                          </Link>
                        </td>
                        <td className="px-4 py-2">{PRODUCT[row.plan] ?? row.plan}</td>
                        <td className="px-4 py-2">{word(STORE, row.paymentMethod ?? "admin_grant")}</td>
                        <td className="px-4 py-2">{word(SUBSCRIPTION, row.status)}</td>
                        <td className="px-4 py-2">{day(row.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="overflow-x-auto rounded-xl border bg-background">
              <div className="p-4 pb-2">
                <h2 className="font-bold">آخر إشعارات المتاجر (Webhooks)</h2>
                <p className="text-xs text-muted-foreground">
                  إشعارات التجديد والإلغاء والاسترداد اللي جت من Google Play وApple.
                </p>
              </div>
              {money.data.recentEvents.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  مفيش إشعارات متاجر وصلت لسه.
                </p>
              ) : (
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-start font-medium">المتجر</th>
                      <th className="px-4 py-2 text-start font-medium">الحدث</th>
                      <th className="px-4 py-2 text-start font-medium">امتى</th>
                    </tr>
                  </thead>
                  <tbody>
                    {money.data.recentEvents.map((ev) => (
                      <tr key={ev.id} className="border-t">
                        <td className="px-4 py-2">{word(STORE, ev.store)}</td>
                        <td className="px-4 py-2" dir="ltr">{ev.eventType}</td>
                        <td className="px-4 py-2">{dayTime(ev.eventTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        مميزات كل باقة وحدود التجربة المجانية والمكالمة الصوتية في صفحة <Link className="underline" to="/plans">الباقات والحدود</Link>.
      </p>
    </div>
  );
}
