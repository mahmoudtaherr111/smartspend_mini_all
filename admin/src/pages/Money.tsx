import { Link } from "react-router-dom";
import { AdminPlansTab } from "@/components/admin/settings/AdminPlansTab";
import { trpc } from "@admin/lib/trpc";
import { SettingsEditor } from "../ui/SettingsEditor";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { STORE, SUBSCRIPTION, count, day, word } from "../ui/words";

const PRODUCT: Record<string, string> = {
  pro_monthly: "Pro شهري",
  pro_yearly: "Pro سنوي",
  ultra_monthly: "Ultra شهري",
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

/** Who pays, from which store, what that is worth a month, and what each plan includes. */
export function Money() {
  const money = trpc.adminConsole.money.useQuery();

  return (
    <div>
      <PageHeader
        title="الفلوس والباقات"
        description="الاشتراكات من Google Play وApp Store، وتقدير الإيراد الشهري، وإيه اللي كل باقة فيها وحدودها."
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
              label="اشتركوا الشهر ده"
              value={count(money.data.newThisMonth)}
              note={`وخلص أو اترد اشتراك ${count(money.data.endedThisMonth)}`}
            />
          </div>

          <section className="mt-4 overflow-x-auto rounded-xl border bg-background">
            <div className="p-4 pb-2">
              <h2 className="font-bold">آخر الاشتراكات</h2>
              <p className="text-xs text-muted-foreground">
                الإلغاء بيتم من المتجر نفسه، والباقة بتفضل شغالة لحد آخر المدة
                المدفوعة.
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
        </>
      )}

      <section className="mt-6">
        <h2 className="mb-1 text-lg font-bold">الباقات وحدودها</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          كل خانة هنا بتتحفظ لما تدوس «احفظ» تحت، وبتوصل للتطبيق خلال دقايق.
          الحدود اللي صفر معناها من غير حد.
        </p>
        <SettingsEditor>
          {(props) => <AdminPlansTab {...props} />}
        </SettingsEditor>
      </section>
    </div>
  );
}
