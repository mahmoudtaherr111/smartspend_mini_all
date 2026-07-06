import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-emerald-500" />,
        info: <InfoIcon className="size-4 text-blue-500" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-500" />,
        error: <OctagonXIcon className="size-4 text-rose-500" />,
        loading: <Loader2Icon className="size-4 animate-spin text-slate-500" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white/98 dark:group-[.toaster]:bg-slate-900/98 group-[.toaster]:text-slate-900 dark:group-[.toaster]:text-slate-100 group-[.toaster]:border-slate-200/90 dark:group-[.toaster]:border-slate-800/90 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-2xl group-[.toaster]:p-4 group-[.toaster]:backdrop-blur-md transition-all duration-300 font-sans border text-end",
          title:
            "text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-snug",
          description:
            "text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1 leading-normal",
          actionButton:
            "group-[.toast]:bg-indigo-600 group-[.toast]:text-white group-[.toast]:hover:bg-indigo-700 group-[.toast]:font-bold group-[.toast]:rounded-xl group-[.toast]:h-9 group-[.toast]:px-3.5 group-[.toast]:text-xs group-[.toast]:transition-all group-[.toast]:active:scale-95 group-[.toast]:shadow-sm group-[.toast]:shadow-indigo-200 dark:group-[.toast]:shadow-none",
          cancelButton:
            "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-600 group-[.toast]:hover:bg-slate-200 group-[.toast]:font-semibold group-[.toast]:rounded-xl group-[.toast]:h-9 group-[.toast]:px-3.5 group-[.toast]:text-xs",
        },
      }}
      style={
        {
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

import { toast as sonnerToast } from "sonner";

export const useToast = () => {
  return {
    toast: ({
      title,
      description,
      variant,
    }: {
      title: string;
      description?: string;
      variant?: "default" | "destructive" | "success" | "error" | "warning";
    }) => {
      if (variant === "error" || variant === "destructive") {
        sonnerToast.error(title, { description });
      } else if (variant === "success") {
        sonnerToast.success(title, { description });
      } else if (variant === "warning") {
        sonnerToast.warning(title, { description });
      } else {
        sonnerToast(title, { description });
      }
    },
  };
};

export { Toaster };

