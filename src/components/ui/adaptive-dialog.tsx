"use client";

import * as React from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSheetManager } from "@/hooks/useSheetManager";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
  DrawerOverlay,
  DrawerPortal,
} from "@/components/ui/drawer";

// ─── Adaptive Dialog Context ───
interface AdaptiveDialogContextValue {
  isMobile: boolean;
}

const AdaptiveDialogContext = React.createContext<AdaptiveDialogContextValue>({
  isMobile: false,
});

export function useAdaptiveDialog() {
  return React.useContext(AdaptiveDialogContext);
}

// ─── Root Adaptive Dialog ───
export interface AdaptiveDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  modal?: boolean;
  snapPoints?: (string | number)[];
  activeSnapPoint?: string | number | null;
  setActiveSnapPoint?: (snapPoint: string | number | null) => void;
  repositionInputs?: boolean;
  shouldScaleBackground?: boolean;
  dismissible?: boolean;
  direction?: "top" | "bottom" | "left" | "right";
  nested?: boolean;
  breakpointQuery?: string;
}

export function AdaptiveDialog({
  children,
  open,
  onOpenChange,
  defaultOpen,
  modal,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  repositionInputs = true,
  shouldScaleBackground = false,
  dismissible = true,
  direction = "bottom",
  nested = false,
  breakpointQuery = "(max-width: 768px)",
  ...props
}: AdaptiveDialogProps) {
  const isMobile = useMediaQuery(breakpointQuery);

  // Register with Sheet Stack for Android Hardware Back Button and web popstate
  useSheetManager(Boolean(open), () => onOpenChange?.(false));

  if (isMobile) {
    return (
      <AdaptiveDialogContext.Provider value={{ isMobile: true }}>
        <Drawer
          open={open}
          onOpenChange={onOpenChange}
          defaultOpen={defaultOpen}
          modal={modal}
          snapPoints={snapPoints}
          activeSnapPoint={activeSnapPoint}
          setActiveSnapPoint={setActiveSnapPoint}
          repositionInputs={repositionInputs}
          shouldScaleBackground={shouldScaleBackground}
          dismissible={dismissible}
          direction={direction}
          nested={nested}
          {...props}
        >
          {children}
        </Drawer>
      </AdaptiveDialogContext.Provider>
    );
  }

  return (
    <AdaptiveDialogContext.Provider value={{ isMobile: false }}>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        defaultOpen={defaultOpen}
        modal={modal}
        {...props}
      >
        {children}
      </Dialog>
    </AdaptiveDialogContext.Provider>
  );
}

// ─── Trigger ───
export const AdaptiveDialogTrigger = React.forwardRef<
  any,
  React.ComponentPropsWithoutRef<typeof DialogTrigger>
>(({ children, ...props }, ref) => {
  const { isMobile } = useAdaptiveDialog();
  if (isMobile) {
    return (
      <DrawerTrigger ref={ref} {...props}>
        {children}
      </DrawerTrigger>
    );
  }
  return (
    <DialogTrigger ref={ref} {...props}>
      {children}
    </DialogTrigger>
  );
});
AdaptiveDialogTrigger.displayName = "AdaptiveDialogTrigger";

// ─── Close ───
export const AdaptiveDialogClose = React.forwardRef<
  any,
  React.ComponentPropsWithoutRef<typeof DialogClose>
>(({ children, ...props }, ref) => {
  const { isMobile } = useAdaptiveDialog();
  if (isMobile) {
    return (
      <DrawerClose ref={ref} {...props}>
        {children}
      </DrawerClose>
    );
  }
  return (
    <DialogClose ref={ref} {...props}>
      {children}
    </DialogClose>
  );
});
AdaptiveDialogClose.displayName = "AdaptiveDialogClose";

// ─── Content ───
export interface AdaptiveDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogContent> {
  showGrabber?: boolean;
  showCloseButton?: boolean;
}

export const AdaptiveDialogContent = React.forwardRef<
  HTMLDivElement,
  AdaptiveDialogContentProps
>(({ className, children, showGrabber = true, showCloseButton = true, ...props }, ref) => {
  const { isMobile } = useAdaptiveDialog();

  if (isMobile) {
    return (
      <DrawerContent
        ref={ref}
        className={cn(
          "max-h-[92vh] pb-[max(1.5rem,env(safe-area-inset-bottom))] rounded-t-3xl border-t border-slate-200 dark:border-slate-800 bg-background shadow-2xl focus:outline-hidden",
          className
        )}
        {...props}
      >
        {showGrabber && (
          <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 my-3 shrink-0" />
        )}
        <div className="overflow-y-auto px-4 pb-4 flex-1">{children}</div>
      </DrawerContent>
    );
  }

  return (
    <DialogContent
      ref={ref}
      className={cn("rounded-2xl sm:max-w-lg", className)}
      showCloseButton={showCloseButton}
      {...props}
    >
      {children}
    </DialogContent>
  );
});
AdaptiveDialogContent.displayName = "AdaptiveDialogContent";

// ─── Header ───
export function AdaptiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof DialogHeader>) {
  const { isMobile } = useAdaptiveDialog();
  if (isMobile) {
    return (
      <DrawerHeader
        className={cn("text-right px-1 pt-1 pb-3 text-start", className)}
        {...props}
      />
    );
  }
  return (
    <DialogHeader
      className={cn("text-right pb-3 text-start", className)}
      {...props}
    />
  );
}

// ─── Footer ───
export function AdaptiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooter>) {
  const { isMobile } = useAdaptiveDialog();
  if (isMobile) {
    return (
      <DrawerFooter
        className={cn("px-1 pt-2 gap-2 flex-col-reverse sm:flex-row", className)}
        {...props}
      />
    );
  }
  return (
    <DialogFooter
      className={cn("pt-4 gap-2 flex-col-reverse sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

// ─── Title ───
export const AdaptiveDialogTitle = React.forwardRef<
  any,
  React.ComponentPropsWithoutRef<typeof DialogTitle>
>(({ className, ...props }, ref) => {
  const { isMobile } = useAdaptiveDialog();
  if (isMobile) {
    return (
      <DrawerTitle
        ref={ref}
        className={cn("text-base font-bold text-foreground", className)}
        {...props}
      />
    );
  }
  return (
    <DialogTitle
      ref={ref}
      className={cn("text-lg font-bold text-foreground", className)}
      {...props}
    />
  );
});
AdaptiveDialogTitle.displayName = "AdaptiveDialogTitle";

// ─── Description ───
export const AdaptiveDialogDescription = React.forwardRef<
  any,
  React.ComponentPropsWithoutRef<typeof DialogDescription>
>(({ className, ...props }, ref) => {
  const { isMobile } = useAdaptiveDialog();
  if (isMobile) {
    return (
      <DrawerDescription
        ref={ref}
        className={cn("text-xs text-muted-foreground", className)}
        {...props}
      />
    );
  }
  return (
    <DialogDescription
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
AdaptiveDialogDescription.displayName = "AdaptiveDialogDescription";

// ─── Overlay & Portal (Utilities) ───
export function AdaptiveDialogOverlay(props: React.ComponentProps<typeof DialogOverlay>) {
  const { isMobile } = useAdaptiveDialog();
  return isMobile ? <DrawerOverlay {...props} /> : <DialogOverlay {...props} />;
}

export function AdaptiveDialogPortal(props: React.ComponentProps<typeof DialogPortal>) {
  const { isMobile } = useAdaptiveDialog();
  return isMobile ? <DrawerPortal {...props} /> : <DialogPortal {...props} />;
}

// ─── Backward & Interop Aliases (ResponsiveDialog) ───
export {
  AdaptiveDialog as ResponsiveDialog,
  AdaptiveDialogTrigger as ResponsiveDialogTrigger,
  AdaptiveDialogContent as ResponsiveDialogContent,
  AdaptiveDialogHeader as ResponsiveDialogHeader,
  AdaptiveDialogFooter as ResponsiveDialogFooter,
  AdaptiveDialogTitle as ResponsiveDialogTitle,
  AdaptiveDialogDescription as ResponsiveDialogDescription,
  AdaptiveDialogClose as ResponsiveDialogClose,
};
