import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { trpc } from "@admin/lib/trpc";
import { SaveBar } from "./SaveBar";
import { LoadError, Loading } from "./states";

type Models = { id: string; name: string; provider: string; type: string }[];

/**
 * Edits system settings with the save bar: the form shows the saved values with the admin's changes on top, only the
 * changed keys are sent, and the toast says how many changed. Used to host the settings sections of the previous
 * console while they move.
 */
export function SettingsEditor({
  children,
}: {
  children: (props: {
    formData: Record<string, string>;
    updateField: (key: string, value: string) => void;
    models: Models;
  }) => ReactNode;
}) {
  const utils = trpc.useUtils();
  const settings = trpc.admin.getSettings.useQuery();
  const models = trpc.admin.getAvailableModels.useQuery();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(
        `اتحفظ ${changes.length === 1 ? "التغيير" : `${changes.length} تغييرات`}، وبيوصل لكل السيرفرات خلال دقايق`,
      );
      setDraft({});
      void utils.admin.getSettings.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const saved = (settings.data ?? {}) as Record<string, string>;
  const formData = useMemo(() => ({ ...saved, ...draft }), [saved, draft]);
  const changes = useMemo(
    () =>
      Object.entries(draft).filter(
        ([key, value]) => (saved[key] ?? "") !== value,
      ),
    [draft, saved],
  );

  if (settings.isLoading) return <Loading />;
  if (!settings.data)
    return (
      <LoadError
        message="ماقدرناش نجيب الإعدادات."
        onRetry={() => settings.refetch()}
      />
    );

  return (
    <>
      {children({
        formData,
        updateField: (key, value) =>
          setDraft((current) => ({ ...current, [key]: value })),
        models: ((models.data as { models?: Models } | undefined)?.models ??
          []) as Models,
      })}
      <SaveBar
        changes={changes.length}
        busy={save.isPending}
        onSave={() => save.mutate(Object.fromEntries(changes))}
        onDiscard={() => setDraft({})}
      />
    </>
  );
}
