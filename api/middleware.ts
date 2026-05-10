import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Authed: any logged in user
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
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

// Pro: for premium features
export const proProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  }
  if (ctx.user.plan !== "pro" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه الميزة متاحة فقط للبرو" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
