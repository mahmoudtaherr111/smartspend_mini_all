import { TAXONOMY, TAXONOMY_VERSION } from "../contracts/taxonomy";
import { authedProcedure, router } from "./middleware";

// Display data for recording clients. The classifier's wording stays server-side.
const categories = TAXONOMY.map(({ id, nameAr, nameEn, group, icon, color, kinds, subs }) => ({
  id, nameAr, nameEn, group, icon, color, kinds,
  subs: subs.map(sub => ({ id: sub.id, nameAr: sub.nameAr, nameEn: sub.nameEn })),
}));

export const taxonomyRouter = router({
  get: authedProcedure.query(() => ({ version: TAXONOMY_VERSION, categories })),
});
