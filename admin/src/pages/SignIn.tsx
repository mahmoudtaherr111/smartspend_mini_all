import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";

/** The console's own door: Google, or a phone account that has the admin role. */
export function SignIn({ forbidden }: { forbidden: boolean }) {
  const utils = trpc.useUtils();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.localAuth.login.useMutation({
    onSuccess: () => utils.adminConsole.session.invalidate(),
  });
  const logout = trpc.localAuth.logout.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!phone.trim() || !password) return;
    login.mutate({ phone: phone.trim(), password });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold">إدارة SmartSpend</h1>
            <p className="text-sm text-muted-foreground">للفريق بس</p>
          </div>
        </div>

        {forbidden ? (
          <div className="space-y-4">
            <p className="text-sm">الحساب ده مالوش صلاحية على لوحة الإدارة. ادخل بحساب تاني.</p>
            <Button variant="outline" className="w-full" onClick={() => logout.mutate()} disabled={logout.isPending}>
              اخرج وادخل بحساب تاني
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <Button asChild className="w-full">
              <a href="/api/auth/google/start?next=/admin/">ادخل بحساب Google</a>
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              أو برقم التليفون
              <span className="h-px flex-1 bg-border" />
            </div>
            <form className="space-y-3" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="admin-phone">رقم التليفون</Label>
                <Input
                  id="admin-phone"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="username"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-password">الباسورد</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
              <Button type="submit" variant="outline" className="w-full" disabled={login.isPending}>
                ادخل
              </Button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
