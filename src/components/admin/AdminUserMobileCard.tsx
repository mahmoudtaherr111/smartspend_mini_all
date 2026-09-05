import { Eye, MessageCircle, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useAdmin } from "@/hooks/useAdmin";

type AdminUser = NonNullable<
  ReturnType<typeof useAdmin>["users"]["data"]
>["users"][number];

interface Props {
  user: AdminUser;
  disabled: boolean;
  onRole: (role: "user" | "moderator" | "admin") => void;
  onPlan: (plan: "free" | "pro" | "ultra") => void;
  onMessage: () => void;
  onProfile: () => void;
  onSessions: () => void;
  onDelete: () => void;
}

export function AdminUserMobileCard({
  user,
  disabled,
  onRole,
  onPlan,
  onMessage,
  onProfile,
  onSessions,
  onDelete,
}: Props) {
  const contact = user.email || ("phone" in user ? user.phone : null);
  const selectClass =
    "mt-1 min-h-11 w-full min-w-0 rounded-xl border bg-background px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <article
      className="min-w-0 rounded-2xl border bg-background p-4"
      aria-label={`حساب ${user.name}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 font-bold text-indigo-500"
        >
          {user.name?.[0] || "؟"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-bold">{user.name}</h3>
          <p
            dir="auto"
            className="truncate text-start text-xs text-muted-foreground"
          >
            {contact}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {user.userType === "oauth" ? "حساب Google" : "حساب محلي"}
          </p>
        </div>
      </div>
      <div className="my-4 grid grid-cols-2 gap-3">
        <label className="min-w-0 text-xs font-bold">
          الصلاحية
          <select
            aria-label={`صلاحية ${user.name}`}
            className={selectClass}
            disabled={disabled}
            value={user.role || "user"}
            onChange={(event) => {
              const role = event.target.value;
              if (role === "admin" || role === "moderator" || role === "user")
                onRole(role);
            }}
          >
            <option value="user">مستخدم عادي</option>
            <option value="moderator">مشرف</option>
            <option value="admin">إدارة عليا</option>
          </select>
        </label>
        <label className="min-w-0 text-xs font-bold">
          الباقة
          <select
            aria-label={`باقة ${user.name}`}
            className={selectClass}
            disabled={disabled}
            value={user.plan || "free"}
            onChange={(event) => {
              const plan = event.target.value;
              if (plan === "free" || plan === "pro" || plan === "ultra")
                onPlan(plan);
            }}
          >
            <option value="free">مجانية</option>
            <option value="pro">Pro</option>
            <option value="ultra">Ultra</option>
          </select>
        </label>
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
        <div>
          <dt className="text-muted-foreground">إجمالي المصروفات</dt>
          <dd className="mt-1 break-words font-bold">
            {Number(user.totalSpent || 0).toLocaleString("ar-EG")} ج.م
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">العمليات</dt>
          <dd className="mt-1 font-bold">{user.expenseCount || 0}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="min-h-11 gap-2 text-xs"
          onClick={onProfile}
        >
          <UserCheck className="size-4" />
          البروفايل
        </Button>
        <Button
          variant="outline"
          className="min-h-11 gap-2 text-xs"
          onClick={onSessions}
        >
          <Eye className="size-4" />
          الجلسات
        </Button>
        <Button
          variant="outline"
          className="min-h-11 gap-2 text-xs"
          onClick={onMessage}
        >
          <MessageCircle className="size-4" />
          رسالة
        </Button>
        <Button
          variant="outline"
          className="min-h-11 gap-2 text-xs text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
          حذف الحساب
        </Button>
      </div>
    </article>
  );
}
