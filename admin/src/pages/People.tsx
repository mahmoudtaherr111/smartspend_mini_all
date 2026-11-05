import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Badge } from "@admin/kit/badge";
import { Input } from "@admin/kit/input";
import { trpc } from "@admin/lib/trpc";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { ACCOUNT, PLAN, ROLE, day, word } from "../ui/words";

/** Everyone who signed up, newest first; type a name, phone or email to find one person. */
export function People() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const people = trpc.adminConsole.searchPeople.useQuery({ query: deferred, limit: 50 });

  return (
    <div>
      <PageHeader title="الناس" description="دوّر بالاسم أو رقم التليفون أو الإيميل، وافتح أي حد تشوف كل حاجة عنه." />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="منى، 0101234، mona@…"
          className="ps-9"
          aria-label="دوّر على شخص"
        />
      </div>

      {people.isLoading ? (
        <Loading />
      ) : !people.data ? (
        <LoadError message="ماقدرناش نجيب القايمة." onRetry={() => people.refetch()} />
      ) : people.data.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {deferred ? `مفيش حد بالاسم أو الرقم «${deferred}».` : "لسه مفيش حد سجّل."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">الاسم</th>
                <th className="px-4 py-2.5 text-start font-medium">التواصل</th>
                <th className="px-4 py-2.5 text-start font-medium">الباقة</th>
                <th className="px-4 py-2.5 text-start font-medium">سجّل من</th>
                <th className="px-4 py-2.5 text-start font-medium">آخر دخول</th>
              </tr>
            </thead>
            <tbody>
              {people.data.map((person) => (
                <tr key={`${person.type}-${person.id}`} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link to={`/people/${person.type}/${person.id}`} className="font-semibold text-emerald-800 hover:underline dark:text-emerald-300">
                      {person.name || "من غير اسم"}
                    </Link>
                    {person.role !== "user" && (
                      <Badge variant="outline" className="ms-2">
                        {word(ROLE, person.role)}
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground">{word(ACCOUNT, person.type)}</div>
                  </td>
                  <td className="px-4 py-2.5" dir="ltr" style={{ textAlign: "right" }}>
                    {person.contact ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{word(PLAN, person.plan)}</td>
                  <td className="px-4 py-2.5">{day(person.createdAt)}</td>
                  <td className="px-4 py-2.5">{day(person.lastSignInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
