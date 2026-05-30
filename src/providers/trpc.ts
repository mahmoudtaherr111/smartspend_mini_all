import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../api/router";

export const trpc = createTRPCReact<AppRouter>();

function friendlyHttpError(status: number) {
  if (status === 401) return "انتهت الجلسة. سجل الدخول مرة أخرى.";
  if (status === 403) return "ليس لديك صلاحية لتنفيذ هذه العملية.";
  if (status === 404) return "المسار المطلوب غير موجود في الخادم.";
  if (status === 429)
    return "طلبات كثيرة خلال وقت قصير. انتظر لحظة وحاول مرة أخرى.";
  if (status >= 500) return "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.";
  return "تعذر إكمال الطلب. راجع البيانات وحاول مرة أخرى.";
}

// VITE_API_URL → backend deployed separately (e.g. https://api.smartspend.app)
// Falls back to relative /api/trpc for monorepo dev mode (Vite dev server proxies to Hono)
// Using `as any` cast to stay compatible with both tsconfig.app (vite/client) and tsconfig.server (node)
const _viteMeta = (import.meta as any)?.env as
  | Record<string, string>
  | undefined;
const _viteApiUrl = _viteMeta?.["VITE_API_URL"];
const API_BASE_URL = _viteApiUrl ? `${_viteApiUrl}/api/trpc` : "/api/trpc";

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

        const text = await response.text();

        try {
          JSON.parse(text);
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
        const token = localStorage.getItem("local_auth_token");
        return {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "bypass-tunnel-reminder": "true",
          "ngrok-skip-browser-warning": "true",
        };
      },
    }),
  ],
});
