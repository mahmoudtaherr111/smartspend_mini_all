import { toast } from "sonner";
import { SplashScreen } from "@capacitor/splash-screen";
import { Capacitor } from "@capacitor/core";

let deferredInstall: BeforeInstallPromptEvent | null = null;

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isStandalonePwa(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) &&
    !(window as Window & { MSStream?: unknown }).MSStream;
  // Modern iPadOS Safari poses as macOS Safari, but features maxTouchPoints > 2 and "Macintosh" user agent
  const isMaciPad =
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 2 &&
    /Macintosh/.test(ua);
  return isIos || !!isMaciPad;
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredInstall;
}

export async function triggerInstallPrompt(): Promise<boolean> {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  if (outcome === "accepted") deferredInstall = null;
  return outcome === "accepted";
}

function notifyWaitingWorker(registration: ServiceWorkerRegistration) {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}

function applyWaitingUpdate(registration: ServiceWorkerRegistration) {
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  // Do not reload before the replacement worker takes control, otherwise the
  // user can land back on the old shell and think the update failed.
  navigator.serviceWorker.addEventListener("controllerchange", reload, {
    once: true,
  });
  notifyWaitingWorker(registration);
  window.setTimeout(reload, 2_000);
}

export function registerAppServiceWorker(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent("pwa-install-available"));
  });

  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    toast.success("تم تثبيت SmartSpend على جهازك");
  });

  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  const onLoad = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              toast("تحديث جديد متاح", {
                description: "اضغط لتحديث التطبيق دون فقدان بياناتك.",
                duration: 12000,
                action: {
                  label: "تحديث الآن",
                  onClick: () => {
                    applyWaitingUpdate(registration);
                  },
                },
              });
            }
          });
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          toast("تحديث جاهز", {
            action: {
              label: "تطبيق",
              onClick: () => {
                applyWaitingUpdate(registration);
              },
            },
          });
        }
      })
      .catch((err) => console.warn("[PWA] SW register failed:", err));
  };

  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });
}

/** Hand off from the launch surface as soon as React has painted its first frame. */
export async function dismissAppLoader(): Promise<void> {
  // Font loading must never keep a launch screen over an already interactive
  // application. Cairo is self-hosted and can settle after this hand-off.
  if (Capacitor.isNativePlatform()) {
    try {
      await SplashScreen.hide({ fadeOutDuration: 120 });
    } catch {
      // Native splash control is unavailable when this code runs as a web PWA.
    }
  }

  const root = document.getElementById("root");
  const loader = root?.querySelector(".app-loader") as HTMLElement | null;
  if (!loader) return;
  loader.style.transition = "opacity 0.16s ease-out";
  loader.style.opacity = "0";
  window.setTimeout(() => loader.remove(), 180);
}
