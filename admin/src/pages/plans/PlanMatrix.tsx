import type { ReactNode } from "react";
import { Input } from "@admin/kit/input";
import { Switch } from "@admin/kit/switch";
import { PLAN } from "../../ui/words";

export const PLANS = ["free", "pro", "ultra"] as const;
export type Plan = (typeof PLANS)[number];

export type Row =
  | { kind: "switch"; label: string; hint?: string; key: (plan: Plan) => string; fallback: Record<Plan, boolean>; plans?: readonly Plan[] }
  | { kind: "number"; label: string; hint?: string; key: (plan: Plan) => string; unit?: string; plans?: readonly Plan[]; decimal?: boolean }
  | { kind: "select"; label: string; hint?: string; key: (plan: Plan) => string; options: [string, string][]; plans?: readonly Plan[] };

export type Props = { formData: Record<string, string>; updateField: (key: string, value: string) => void };

/** One cell: the setting of one row for one plan, or a dash for a plan the row does not apply to. */
function Cell({ row, plan, formData, updateField }: Props & { row: Row; plan: Plan }) {
  if (row.plans && !row.plans.includes(plan)) return <span className="text-muted-foreground">—</span>;
  const key = row.key(plan);
  const label = `${row.label} · ${PLAN[plan]}`;
  if (row.kind === "switch") {
    const raw = formData[key];
    const on = raw === "true" ? true : raw === "false" ? false : row.fallback[plan];
    return <Switch checked={on} aria-label={label} onCheckedChange={(checked) => updateField(key, String(checked))} />;
  }
  if (row.kind === "select") {
    return (
      <select aria-label={label} className="h-9 w-full min-w-36 rounded-md border bg-background px-2 text-sm" value={formData[key] ?? ""} onChange={(e) => updateField(key, e.target.value)}>
        {row.options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input aria-label={label} dir="ltr" inputMode="decimal" className="h-9 w-28" value={formData[key] ?? ""}
        onChange={(e) => updateField(key, e.target.value.replace(row.decimal ? /[^\d.]/g : /[^\d]/g, ""))} />
      {row.unit && <span className="text-xs text-muted-foreground">{row.unit}</span>}
    </div>
  );
}

/** Settings that differ by plan, as a table: one row per setting, one column per plan. */
export function PlanMatrix({ title, note, rows, ...props }: Props & { title: string; note?: ReactNode; rows: Row[] }) {
  return (
    <section className="rounded-xl border">
      <div className="border-b p-4">
        <h2 className="font-bold">{title}</h2>
        {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-start">
              <th scope="col" className="p-3 text-start font-semibold">الإعداد</th>
              {PLANS.map((plan) => <th key={plan} scope="col" className="p-3 text-start font-semibold">{PLAN[plan]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.key("free")}>
                <th scope="row" className="max-w-sm p-3 text-start align-top font-normal">
                  <div className="font-semibold">{row.label}</div>
                  {row.hint && <div className="text-xs text-muted-foreground">{row.hint}</div>}
                </th>
                {PLANS.map((plan) => (
                  <td key={plan} className="p-3 align-top"><Cell row={row} plan={plan} {...props} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
