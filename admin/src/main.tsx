import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { trpc } from "@/providers/trpc";
import App from "./App";
import "./admin.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // An admin reads live numbers: no stale cache across tabs, one retry on a network blip.
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
  },
});

// Same origin as the API, with the session cookie: no token ever lives in the page.
const client = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename="/admin">
          <App />
          <Toaster dir="rtl" position="bottom-left" richColors closeButton />
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
