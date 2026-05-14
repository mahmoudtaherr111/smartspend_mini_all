import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../api/router";

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
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

        const response = await fetch(requestUrl as RequestInfo, {
          ...(init ?? {}),
          credentials: "include",
        });
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
              text.slice(0, 1000)
            );
          } catch {}
          const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if (match && match[0]) {
            const headers = new Headers(response.headers as any);
            headers.set("content-type", "application/json");
            return new Response(match[0], {
              status: response.status,
              headers,
            });
          }
          const headers = new Headers(response.headers as any);
          headers.set("content-type", "application/json");
          return new Response(JSON.stringify({}), {
            status: response.status,
            headers,
          });
        }
      },
      headers() {
        const token = localStorage.getItem("local_auth_token");
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
