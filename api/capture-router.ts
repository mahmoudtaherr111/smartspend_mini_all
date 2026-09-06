import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { captureAnswerSchema } from "../contracts/financial-capture";
import {
  answerCapture,
  confirmCapture,
  dismissCapture,
  getCapture,
  listCaptures,
} from "./services/financial-capture-store";
import { invalidateUserClassificationCache } from "./lib/smart-pipeline";
import { invalidateUserMemory } from "./lib/muscle-memory";
import { invalidateFinanceUserCache } from "./services/finance-semantic-layer";
import { CATEGORIES } from "./lib/category-registry";
const selection = z.object({
  captureId: z.string().uuid(),
  version: z.number().int().positive(),
});
export const captureRouter = router({
  taxonomy: authedProcedure.query(() =>
    CATEGORIES.map((c) => ({
      name: c.name_ar,
      type: c.type,
      subs: c.subcategories.map((s) => s.name_ar),
    })),
  ),
  list: authedProcedure.query(({ ctx }) => listCaptures(ctx.user)),
  get: authedProcedure
    .input(z.object({ captureId: z.string().uuid() }))
    .query(({ ctx, input }) => getCapture(ctx.user, input.captureId)),
  answer: authedProcedure
    .input(captureAnswerSchema)
    .mutation(({ ctx, input }) => answerCapture(ctx.user, input)),
  dismiss: authedProcedure
    .input(selection)
    .mutation(({ ctx, input }) =>
      dismissCapture(ctx.user, input.captureId, input.version),
    ),
  confirm: authedProcedure.input(selection).mutation(async ({ ctx, input }) => {
    const receipt = await confirmCapture(
      ctx.user,
      input.captureId,
      input.version,
    );
    invalidateUserMemory(ctx.user.id, ctx.user.type);
    invalidateUserClassificationCache(ctx.user.id, ctx.user.type);
    // A cache outage after commit must not turn a saved receipt into a failed save.
    // invalidateFinanceUserCache already advances the dashboard generation as well.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        invalidateFinanceUserCache(ctx.user.id, ctx.user.type).catch(
          () => undefined,
        ),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 500);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return receipt;
  }),
});
