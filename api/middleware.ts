import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";
import { createRateLimiter } from "./lib/rate-limit";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const isProduction = process.env.NODE_ENV === "production";
    const retryAfterSeconds =
      error.cause && typeof (error.cause as any).retryAfterSeconds === "number"
        ? (error.cause as any).retryAfterSeconds
        : undefined;

    return {
      ...shape,
      data: {
        ...shape.data,
        retryAfterSeconds,
        stack: isProduction ? undefined : shape.data.stack,
      },
      message:
        isProduction && shape.data.code === "INTERNAL_SERVER_ERROR"
          ? "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى."
          : shape.message,
    };
  },
});

export const router = t.router;

/** All anonymous tRPC traffic — generous per-IP cap (SEO, ads list, etc.). */
const publicIpLimiter = createRateLimiter(400, 60_000);
/** Sensitive auth endpoints — stricter per-IP cap. */
const strictPublicIpLimiter = createRateLimiter(25, 15 * 60_000);
/** Authed general user traffic */
const userRateLimiter = createRateLimiter(100, 60_000);
/** AI Rate Limiter (expensive operations) */
const aiRateLimiter = createRateLimiter(100, 60_000);

export const publicProcedure = t.procedure.use(async ({ ctx, next }) => {
  await publicIpLimiter.hit(`pub:${ctx.ip}`, "طلبات كتير جداً من نفس الشبكة. جرب بعد دقيقة.");
  return next();
});

/** Use for register / login / OAuth token exchange — anti brute-force per IP. */
export const strictPublicProcedure = t.procedure.use(async ({ ctx, next }) => {
  await strictPublicIpLimiter.hit(
    `strict:${ctx.ip}`,
    "محاولات كتيرة لتسجيل الدخول أو التسجيل من نفس الشبكة. استنى شوية وحاول تاني."
  );
  return next();
});

// Authed: any logged in user
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }

  await userRateLimiter.hit(
    `usr:${ctx.user.type}:${ctx.user.id}`,
    "طلبات كتير جداً! اهدى شوية واستنى شوية.",
  );

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const aiProcedure = authedProcedure.use(async ({ ctx, next }) => {
  await aiRateLimiter.hit(
    `ai:${ctx.user.type}:${ctx.user.id}`,
    "طلبات الذكاء الاصطناعي كتير جداً! استنى شوية وحاول تاني.",
  );

  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Moderator: can view everything except delete users/remove admin
export const moderatorProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية الوصول" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Admin: full access
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية الأدمن" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Pro subscription required (pro, ultra, or admin bypass)
export const proProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const isPrivileged =
    ctx.user.plan === "pro" ||
    ctx.user.plan === "ultra" ||
    ctx.user.role === "admin";

  if (!isPrivileged) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذه الميزة متاحة فقط لمشتركي باقة برو أو ألترا",
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Pro AI Procedure: requires Pro subscription + AI rate limit
export const proAiProcedure = proProcedure.use(async ({ ctx, next }) => {
  await aiRateLimiter.hit(
    `ai:${ctx.user.type}:${ctx.user.id}`,
    "طلبات الذكاء الاصطناعي كتير جداً! استنى شوية وحاول تاني.",
  );

  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Ultra subscription required (ultra, or admin bypass)
export const ultraProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const isPrivileged = ctx.user.plan === "ultra" || ctx.user.role === "admin";

  if (!isPrivileged) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "هذه الميزة متاحة فقط لمشتركي باقة ألترا",
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});
