import { useState } from "react";
import { cn } from "@/lib/utils";

/** The user's photo (Google accounts have one) or their initials. */
export function UserAvatar({
  name,
  avatar,
  size = "md",
}: {
  name?: string | null;
  avatar?: string | null;
  size?: "md" | "lg";
}) {
  const [broken, setBroken] = useState(false);
  const initials =
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? "")
      .join("") || "؟";
  const box = size === "lg" ? "size-14 text-lg" : "size-12 text-base";

  if (avatar && /^https:\/\//.test(avatar) && !broken) {
    return (
      <img
        src={avatar}
        alt=""
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full object-cover", box)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100",
        box,
      )}
    >
      {initials}
    </span>
  );
}
