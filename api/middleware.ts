import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";
import { createRateLimiter } from "./lib/rate-limit";

const t = initTRPC.context<Context>().create();

export const router = t.router;

/** All anonymous tRPC traffic — generous per-IP cap (SEO, ads list, etc.). */
const publicIpLimiter = createRateLimiter(400, 60_000);
/** Sensitive auth endpoints — stricter per-IP cap. */
const strictPublicIpLimiter = createRateLimiter(25, 15 * 60_000);

export const publicProcedure = t.procedure.use(async ({ ctx, next }) => {
  publicIpLimiter.hit(`pub:${ctx.ip}`, "طلبات كتير جداً من نفس الشبكة. جرب بعد دقيقة.");
  return next();
});

/** Use for register / login / OAuth token exchange — anti brute-force per IP. */
export const strictPublicProcedure = t.procedure.use(async ({ ctx, next }) => {
  strictPublicIpLimiter.hit(
    `strict:${ctx.ip}`,
    "محاولات كتيرة لتسجيل الدخول أو التسجيل من نفس الشبكة. استنى شوية وحاول تاني."
  );
  return next();
});

// Simple in-memory rate limiter (per authenticated user)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute

// AI Rate Limiter (Stricter for expensive operations)
const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const AI_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const AI_MAX_REQUESTS = 10; // 10 requests per minute

// Auto-cleanup expired rate limiter and AI rate limiter entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
  for (const [key, entry] of aiRateLimitMap) {
    if (entry.resetAt < now) {
      aiRateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Authed: any logged in user
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }

  const key = `${ctx.user.type}:${ctx.user.id}`;
  const now = Date.now();
  const limit = rateLimitMap.get(key);

  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
  } else {
    limit.count++;
    if (limit.count > MAX_REQUESTS) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "طلبات كتير جداً! اهدى شوية." });
    }
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const aiProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const key = `${ctx.user.type}:${ctx.user.id}`;
  const now = Date.now();
  const limit = aiRateLimitMap.get(key);

  if (!limit || now > limit.resetAt) {
    aiRateLimitMap.set(key, { count: 1, resetAt: now + AI_RATE_LIMIT_WINDOW });
  } else {
    limit.count++;
    if (limit.count > AI_MAX_REQUESTS) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "طلبات الذكاء الاصطناعي كتير جداً! استنى دقيقة وحاول تاني." });
    }
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Moderator: can view everything except delete users/remove admin
export const moderatorProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }
  if (ctx.user.role !== "admin" && ctx.user.role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية الوصول" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Admin: full access
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية الأدمن" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Pro: for premium features (Pro + Ultra + Admin)
export const proProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }
  if (ctx.user.plan !== "pro" && ctx.user.plan !== "ultra" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه الميزة متاحة فقط للبرو" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Ultra: for top-tier features (Ultra + Admin)
export const ultraProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }
  if (ctx.user.plan !== "ultra" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه الميزة متاحة فقط لمشتركي الألترا 💎" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
