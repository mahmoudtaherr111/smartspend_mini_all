import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignOutDialog } from "@/components/auth/SignOutDialog";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ProfileFieldInput } from "@/components/profile/ProfileFieldInput";
import {
  PROFILE_FIELDS,
  formatProfileFieldValue,
  isValidProfileFieldValue,
  normalizeProfileFieldValue,
  profileFieldValue,
  type ProfileField,
  type ProfileFieldValue,
} from "@contracts/profile-fields";
import {
  AdaptiveDialog,
  AdaptiveDialogClose,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";

/**
 * The profile: who you are, the money answers the app uses (the same fields the Home card asks, from
 * `contracts/profile-fields.ts`), your plan, and at the bottom, set apart, sign out and account deletion.
 */
export function ProfileScreen() {
  const { user } = useAuth();
  const { dir, language, t } = useLanguage();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;
  const { data: profile } = trpc.profile.getSmartProfile.useQuery();
  const { data: limits } = trpc.ai.getUserLimits.useQuery(undefined, { staleTime: 60_000 });

  const [editingName, setEditingName] = useState(false);
  const [editingField, setEditingField] = useState<ProfileField | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const planLabel =
    user?.plan === "ultra" ? t("more.plan.ultra") : user?.plan === "pro" ? t("more.plan.pro") : t("more.plan.free");

  // Call minutes are the one allowance users count; the AI budget is in tokens, which mean nothing to them.
  const voiceLeft = !limits
    ? null
    : limits.voice.remaining === -1
      ? t("profile.usage.unlimited")
      : t("profile.usage.voiceMinutes", { minutes: Math.floor(limits.voice.remaining / 60) });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <UserAvatar name={user?.name} avatar={user?.avatar} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold" dir="auto">
            <bdi>{user?.name || t("more.defaultUserName")}</bdi>
          </p>
          <p className="truncate text-sm text-muted-foreground" dir="ltr">
            {user?.phone || user?.email || ""}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {planLabel}
        </span>
      </header>

      <Section title={t("profile.section.you")}>
        <Row label={t("profile.row.name")} value={user?.name} onClick={() => setEditingName(true)} chevron={Chevron} />
        {user?.phone && <Row label={t("profile.row.phone")} value={user.phone} valueDir="ltr" />}
        {user?.email && <Row label={t("profile.row.email")} value={user.email} valueDir="ltr" />}
      </Section>

      <Section title={t("profile.section.money")} footer={t("profile.section.moneyFooter")}>
        {PROFILE_FIELDS.map((field) => (
          <Row
            key={field.key}
            label={field.label[language]}
            value={formatProfileFieldValue(field, profileFieldValue(profile, field), language) ?? undefined}
            placeholder={t("profile.value.notSet")}
            onClick={() => setEditingField(field)}
            chevron={Chevron}
          />
        ))}
      </Section>

      <Section title={t("profile.section.plan")}>
        <Row label={t("profile.row.plan")} value={planLabel} to="/pro" chevron={Chevron} />
        {voiceLeft && <Row label={t("profile.row.voiceMinutes")} value={voiceLeft} />}
      </Section>

      <Section>
        <Row label={t("more.item.people")} to="/settings/people" chevron={Chevron} />
        <Row label={t("more.item.plan")} to="/plan" chevron={Chevron} />
      </Section>

      <Section>
        <SignOutDialog
          trigger={
            <button type="button" className={rowClass("text-red-600 dark:text-red-400")}>
              {t("more.logout.button")}
            </button>
          }
        />
        <button type="button" className={rowClass("text-red-600 dark:text-red-400")} onClick={() => setDeleteOpen(true)}>
          {t("profile.delete.row")}
        </button>
      </Section>

      <NameSheet
        open={editingName}
        onOpenChange={setEditingName}
        initial={user?.name ?? ""}
        onSaved={() => {
          void utils.auth.me.invalidate();
          void utils.localAuth.me.invalidate();
        }}
      />
      <FieldSheet
        field={editingField}
        initial={editingField ? profileFieldValue(profile, editingField) : undefined}
        onOpenChange={(open) => !open && setEditingField(null)}
      />
      <AdaptiveDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AdaptiveDialogContent>
          <AdaptiveDialogHeader>
            <AdaptiveDialogTitle>{t("profile.delete.title")}</AdaptiveDialogTitle>
            <AdaptiveDialogDescription>{t("profile.delete.body")}</AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <AdaptiveDialogFooter>
            <AdaptiveDialogClose asChild>
              <Button variant="outline" className="h-11">
                {t("profile.edit.cancel")}
              </Button>
            </AdaptiveDialogClose>
            <Button variant="destructive" className="h-11" onClick={() => navigate("/support")}>
              {t("profile.delete.confirm")}
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </div>
  );
}

function rowClass(extra = "") {
  return `flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-slate-200/70 dark:[&:not(:first-child)]:border-slate-800 ${extra}`;
}

function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <h2 className="px-1 text-xs font-bold text-muted-foreground">{title}</h2>}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        {children}
      </div>
      {footer && <p className="px-1 text-xs text-muted-foreground">{footer}</p>}
    </section>
  );
}

interface RowProps {
  label: string;
  value?: string;
  placeholder?: string;
  valueDir?: "ltr" | "auto";
  onClick?: () => void;
  to?: string;
  chevron?: typeof ChevronLeft;
}

/** A settings row: the label, the current value at the end, and a chevron when it opens something. */
function Row({ label, value, placeholder, valueDir = "auto", onClick, to, chevron: Chevron }: RowProps) {
  const content = (
    <>
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      {(value || placeholder) && (
        <span className={`max-w-[60%] truncate ${value ? "text-muted-foreground" : "text-muted-foreground/70"}`} dir={valueDir}>
          {value || placeholder}
        </span>
      )}
      {Chevron && (onClick || to) && <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={rowClass("active-press")}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClass("active-press")}>
        {content}
      </button>
    );
  }
  return <div className={rowClass()}>{content}</div>;
}

function NameSheet({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initial);
  // Only the name is sent: sending the phone too needs a confirmation code and made every save fail.
  const save = trpc.profile.updateUserInfo.useMutation({
    onSuccess: () => {
      toast.success(t("profile.edit.saved"));
      onSaved();
      onOpenChange(false);
    },
    onError: () => toast.error(t("profile.edit.saveError")),
  });
  const valid = name.trim().length >= 2;

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(initial);
        onOpenChange(next);
      }}
    >
      <AdaptiveDialogContent>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{t("profile.row.name")}</AdaptiveDialogTitle>
        </AdaptiveDialogHeader>
        <form
          className="space-y-4 px-4 pb-2 md:px-0"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) save.mutate({ name: name.trim() });
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            autoFocus
            dir="auto"
            className="h-11 text-base"
            aria-label={t("profile.row.name")}
          />
          {!valid && name.length > 0 && <p className="text-xs text-red-600">{t("profile.name.invalid")}</p>}
          <AdaptiveDialogFooter className="px-0">
            <AdaptiveDialogClose asChild>
              <Button type="button" variant="outline" className="h-11">
                {t("profile.edit.cancel")}
              </Button>
            </AdaptiveDialogClose>
            <Button type="submit" className="h-11" disabled={!valid || save.isPending}>
              {t("profile.edit.save")}
            </Button>
          </AdaptiveDialogFooter>
        </form>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

function FieldSheet({
  field,
  initial,
  onOpenChange,
}: {
  field: ProfileField | null;
  initial: ProfileFieldValue | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { language, t } = useLanguage();
  const utils = trpc.useUtils();
  const [value, setValue] = useState<ProfileFieldValue | undefined>(initial);
  const [shownKey, setShownKey] = useState<string | null>(null);
  if (field && field.key !== shownKey) {
    setShownKey(field.key);
    setValue(initial);
  }
  // Saved exactly like an answer on the Home card, so both stay in step.
  const save = trpc.profile.submitOnboardingAnswer.useMutation({
    onSuccess: () => {
      toast.success(t("profile.edit.saved"));
      void utils.profile.getSmartProfile.invalidate();
      void utils.profile.getNextOnboardingQuestion.invalidate();
      setShownKey(null);
      onOpenChange(false);
    },
    onError: () => toast.error(t("profile.edit.saveError")),
  });

  return (
    <AdaptiveDialog
      open={field !== null}
      onOpenChange={(open) => {
        if (!open) setShownKey(null);
        onOpenChange(open);
      }}
    >
      <AdaptiveDialogContent>
        {field && (
          <>
            <AdaptiveDialogHeader>
              <AdaptiveDialogTitle>{field.question[language]}</AdaptiveDialogTitle>
              <AdaptiveDialogDescription>{field.why[language]}</AdaptiveDialogDescription>
            </AdaptiveDialogHeader>
            <div className="px-4 md:px-0">
              <ProfileFieldInput field={field} value={value} onChange={setValue} />
            </div>
            <AdaptiveDialogFooter>
              <AdaptiveDialogClose asChild>
                <Button variant="outline" className="h-11">
                  {t("profile.edit.cancel")}
                </Button>
              </AdaptiveDialogClose>
              <Button
                className="h-11"
                disabled={!isValidProfileFieldValue(field, value) || save.isPending}
                onClick={() => save.mutate({ key: field.key, value: normalizeProfileFieldValue(field, value) ?? undefined, skipped: false })}
              >
                {t("profile.edit.save")}
              </Button>
            </AdaptiveDialogFooter>
          </>
        )}
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
