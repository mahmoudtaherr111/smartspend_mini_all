import { describe, expect, it } from "vitest";
import { adminProcedure, router } from "./middleware";
import type { Context, UnifiedUser } from "./context";

const protectedRouter = router({
  restricted: adminProcedure.query(({ ctx }) => ctx.user.role),
});

function caller(user: UnifiedUser | null) {
  const context: Context = {
    user,
    req: new Request("http://localhost/api/trpc/restricted"),
    ip: "127.0.0.1",
  };
  return protectedRouter.createCaller(context);
}

describe("administrator server access", () => {
  for (const type of ["oauth", "local"] as const) {
    it(`allows a free-plan admin authenticated through ${type}`, async () => {
      await expect(
        caller({
          id: 42,
          name: "Admin",
          type,
          role: "admin",
          plan: "free",
        }).restricted(),
      ).resolves.toBe("admin");
    });
    for (const role of ["user", "moderator"] as const) {
      it(`rejects ${type} ${role} even with an Ultra plan`, async () => {
        await expect(
          caller({
            id: 43,
            name: "User",
            type,
            role,
            plan: "ultra",
          }).restricted(),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      });
    }
  }
  it("rejects unauthenticated requests", async () => {
    await expect(caller(null).restricted()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
