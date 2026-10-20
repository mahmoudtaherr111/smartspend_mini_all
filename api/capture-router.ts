/**
 * What a phone needs from the capture catalog before it reads a notification: the active banks, wallets, payment
 * networks, fintech apps and messaging apps, with their Android apps and confirmed SMS sender ids
 * (api/lib/capture/catalog.ts). The list is the same for every user; `version` lets a phone keep its copy until the
 * catalog changes, so a bank an admin adds reaches phones without an app update.
 */
import { router, authedProcedure } from "./middleware";
import { getCaptureCatalog, sourcesForPhones } from "./lib/capture/catalog";

export const captureRouter = router({
  sources: authedProcedure.query(async () => {
    const catalog = await getCaptureCatalog();
    return { version: catalog.version, sources: sourcesForPhones(catalog) };
  }),
});
