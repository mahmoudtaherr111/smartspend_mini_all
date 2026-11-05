import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../api/router";

/**
 * The console's own client of the API's tRPC router. Only the router's types cross from the server; no code of the
 * website (`src/`) is part of the console (decision 0050).
 */
export const trpc = createTRPCReact<AppRouter>();
