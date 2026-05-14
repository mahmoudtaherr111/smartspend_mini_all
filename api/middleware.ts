import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute

// Authed: any logged in user
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }

  // Rate Limiting
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
