import React from "react";
import { Label } from "@/components/ui/label";
import { CardTitle, CardDescription } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

// ─── Hint Component ───
export function Hint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help inline-block ms-1 shrink-0" />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[280px] text-xs leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Field Label with Hint ───
export function FieldLabel({
  children,
  hint,
  required,
}: {
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
      {children}
      {required && <span className="text-rose-500 text-[10px]">*</span>}
      {hint && <Hint text={hint} />}
    </Label>
  );
}

// ─── Section Header ───
export function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-white/20 dark:border-slate-800 px-6 py-5">
      <CardTitle className="text-lg flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
      {description && (
        <CardDescription className="mt-1.5 text-sm leading-relaxed">
          {description}
        </CardDescription>
      )}
    </div>
  );
}
