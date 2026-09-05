import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../api/router";

export const trpc = createTRPCReact<AppRouter>();

export function friendlyHttpError(status: number) {
  if (status === 401) return "انتهت الجلسة. سجل الدخول مرة أخرى.";
  if (status === 403) return "ليس لديك صلاحية لتنفيذ هذه العملية.";
  if (status === 404) return "المسار المطلوب غير موجود في الخادم.";
  if (status === 429)
    return "طلبات كثيرة خلال وقت قصير. انتظر لحظة وحاول مرة أخرى.";
  if (status >= 500) return "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.";
  return "تعذر إكمال الطلب. راجع البيانات وحاول مرة أخرى.";
}

// =========================================================================
// Form Draft Preservation & Session Expiry Management
// =========================================================================

export const DRAFT_STORAGE_PREFIX = "smartspend_form_draft_";
export const ACTIVE_DRAFTS_INDEX_KEY = "smartspend_active_draft_keys";

export interface FormDraftEnvelope<T = any> {
  data: T;
  savedAt: number;
  formId: string;
}

type DraftCollector = () => Record<string, any> | null | undefined;
const draftCollectors = new Map<string, DraftCollector>();

/**
 * Register an active form's state collector callback. When session expires or drafts are preserved,
 * the collector is invoked and its returned snapshot is saved to sessionStorage.
 */
export function registerDraftCollector(
  formId: string,
  collector: DraftCollector,
): () => void {
  draftCollectors.set(formId, collector);
  return () => {
    draftCollectors.delete(formId);
  };
}

/**
 * Save a form draft explicitly into sessionStorage.
 */
export function saveFormDraft<T = any>(formId: string, data: T): void {
  if (typeof sessionStorage === "undefined" || !formId) return;
  try {
    const envelope: FormDraftEnvelope<T> = {
      data,
      savedAt: Date.now(),
      formId,
    };
    sessionStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${formId}`,
      JSON.stringify(envelope),
    );

    // Update active draft index
    const indexRaw = sessionStorage.getItem(ACTIVE_DRAFTS_INDEX_KEY);
    const indexSet = new Set<string>(indexRaw ? JSON.parse(indexRaw) : []);
    indexSet.add(formId);
    sessionStorage.setItem(
      ACTIVE_DRAFTS_INDEX_KEY,
      JSON.stringify(Array.from(indexSet)),
    );
  } catch (e) {
    console.warn("Failed to save form draft to sessionStorage", e);
  }
}

/**
 * Retrieve a saved form draft from sessionStorage.
 * Discards drafts older than maxAgeMs (default: 24 hours).
 */
export function getFormDraft<T = any>(
  formId: string,
  maxAgeMs = 24 * 60 * 60 * 1000,
): T | null {
  if (typeof sessionStorage === "undefined" || !formId) return null;
  try {
    const raw = sessionStorage.getItem(`${DRAFT_STORAGE_PREFIX}${formId}`);
    if (!raw) return null;
    const envelope: FormDraftEnvelope<T> = JSON.parse(raw);
    if (!envelope || typeof envelope !== "object") return null;

    if (Date.now() - envelope.savedAt > maxAgeMs) {
      clearFormDraft(formId);
      return null;
    }
    return envelope.data;
  } catch {
    return null;
  }
}

/**
 * Clear a specific form draft from sessionStorage.
 */
export function clearFormDraft(formId: string): void {
  if (typeof sessionStorage === "undefined" || !formId) return;
  try {
    sessionStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${formId}`);
    const indexRaw = sessionStorage.getItem(ACTIVE_DRAFTS_INDEX_KEY);
    if (indexRaw) {
      const indexSet = new Set<string>(JSON.parse(indexRaw));
      indexSet.delete(formId);
      sessionStorage.setItem(
        ACTIVE_DRAFTS_INDEX_KEY,
        JSON.stringify(Array.from(indexSet)),
      );
    }
  } catch {}
}

/**
 * Clear all active form drafts from sessionStorage.
 */
export function clearAllFormDrafts(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const indexRaw = sessionStorage.getItem(ACTIVE_DRAFTS_INDEX_KEY);
    if (indexRaw) {
      const keys: string[] = JSON.parse(indexRaw);
      for (const k of keys) {
        sessionStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${k}`);
      }
    }
    sessionStorage.removeItem(ACTIVE_DRAFTS_INDEX_KEY);

    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(DRAFT_STORAGE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {}
}

/**
 * Collect and preserve drafts from all registered forms and active DOM form fields.
 */
export function preserveActiveFormDrafts(): void {
  if (typeof sessionStorage === "undefined") return;

  // 1. Collect from registered collectors
  for (const [formId, collector] of draftCollectors.entries()) {
    try {
      const snapshot = collector();
      if (snapshot && Object.keys(snapshot).length > 0) {
        saveFormDraft(formId, snapshot);
      }
    } catch (e) {
      console.warn(`Failed to collect draft for form: ${formId}`, e);
    }
  }

  // 2. Dispatch custom event so UI components can trigger local draft storage
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("smartspend_preserve_drafts", {
          detail: { timestamp: Date.now() },
        }),
      );
    } catch {}
  }
}

let lastSessionExpiredNotification = 0;
const SESSION_EXPIRED_THROTTLE_MS = 4000;

export interface SessionExpiredOptions {
  silent?: boolean;
  message?: string;
  source?: string;
}

/**
 * Handles 401 unauthenticated session expiry:
 * 1. Preserves all active in-progress form drafts to sessionStorage
 * 2. Broadcasts SESSION_EXPIRED to other tabs and local listeners
 * 3. Triggers user notification without crashing the application
 */
export function handleUnauthenticatedSession(
  options?: SessionExpiredOptions,
): void {
  const now = Date.now();

  // 1. Preserve drafts immediately
  preserveActiveFormDrafts();

  // 2. Dispatch local window events
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("smartspend_session_expired", {
          detail: { timestamp: now, source: options?.source || "trpc" },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("smartspend:session-expired", {
          detail: { timestamp: now, source: options?.source || "trpc" },
        }),
      );
    } catch {}
  }

  // 3. Broadcast to other tabs via BroadcastChannel if available
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("smartspend_auth");
      ch.postMessage({
        type: "SESSION_EXPIRED",
        timestamp: now,
      });
      ch.close();
    }
  } catch {}

  // 4. Show friendly toast notification if not throttled
  if (
    !options?.silent &&
    now - lastSessionExpiredNotification > SESSION_EXPIRED_THROTTLE_MS
  ) {
    lastSessionExpiredNotification = now;
    if (typeof window !== "undefined") {
      import("sonner")
        .then(({ toast }) => {
          toast.error(
            options?.message || "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.",
            {
              id: "session-expired",
              description:
                "تم حفظ المسودة الحالية تلقائياً لتجنب فقدان البيانات.",
            },
          );
        })
        .catch(() => {});
    }
  }
}

// VITE_API_URL → backend deployed separately (e.g. https://api.smartspend.app)
// Falls back to relative /api/trpc for monorepo dev mode (Vite dev server proxies to Hono)
// Using `as any` cast to stay compatible with both tsconfig.app (vite/client) and tsconfig.server (node)
const _viteMeta = (import.meta as any)?.env as
  | Record<string, string>
  | undefined;
const _viteApiUrl = _viteMeta?.["VITE_API_URL"];
const API_BASE_URL = _viteApiUrl ? `${_viteApiUrl}/api/trpc` : "/api/trpc";

export function getTrpcHeaders(): Record<string, string> {
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("local_auth_token")
      : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: API_BASE_URL,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        // Normalize any appended procedure paths back to the base `/api/trpc`
        let requestUrl: string =
          typeof input === "string" ? input : (input as Request).url;
        try {
          // Resolve relative URLs against current location when in browser
          const base =
            typeof window !== "undefined"
              ? window.location.origin
              : "http://localhost:3000";
          const u = new URL(requestUrl, base);
          requestUrl = u.toString();
        } catch (e) {
          console.error("tRPC fetch: invalid URL", input);
        }

        let response: Response;
        try {
          response = await fetch(requestUrl as RequestInfo, {
            ...(init ?? {}),
            credentials: "include",
          });
        } catch (error) {
          console.error("tRPC fetch: network failure", error);
          throw new Error(
            "تعذر الاتصال بالخادم. تأكد أن التطبيق يعمل ثم حاول مرة أخرى.",
          );
        }

        // Handle 401 unauthenticated HTTP status gracefully
        if (response.status === 401) {
          handleUnauthenticatedSession({ source: requestUrl });
        }

        const text = await response.text();

        try {
          const parsed = JSON.parse(text);

          // Check if JSON body indicates UNAUTHORIZED tRPC error in batch or single response
          const has401 = Array.isArray(parsed)
            ? parsed.some(
                (item: any) =>
                  item?.error?.data?.code === "UNAUTHORIZED" ||
                  item?.error?.data?.httpStatus === 401,
              )
            : parsed?.error?.data?.code === "UNAUTHORIZED" ||
              parsed?.error?.data?.httpStatus === 401;

          if (has401 && response.status !== 401) {
            handleUnauthenticatedSession({ source: requestUrl });
          }

          return new Response(text, {
            status: response.status,
            headers: new Headers(response.headers as any),
          });
        } catch {
          try {
            console.error(
              "tRPC fetch: non-JSON response (truncated):",
              text.slice(0, 1000),
            );
          } catch {}
          if (!response.ok) {
            throw new Error(friendlyHttpError(response.status));
          }
          throw new Error("وصل رد غير متوقع من الخادم. حاول تحديث الصفحة.");
        }
      },
      headers() {
        return getTrpcHeaders();
      },
    }),
  ],
});
