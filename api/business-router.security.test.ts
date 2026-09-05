import { describe, it, expect, vi, beforeEach } from "vitest";
import { businessRouter } from "./business-router";
import { TRPCError } from "@trpc/server";
import { userBusinesses, businessCategories, userContacts } from "../db/schema";

// Mock database state for multi-tenant BOLA testing
let mockBusinesses: Array<{
  id: number;
  userId: number;
  userType: "oauth" | "local";
  name: string;
  type: string;
  isActive: boolean;
}> = [];

let mockCategories: Array<{
  id: number;
  businessId: number;
  name: string;
  type: string;
  isActive: boolean;
}> = [];

let mockContacts: Array<{
  id: number;
  userId: number;
  userType: "oauth" | "local";
  name: string;
  businessId: number | null;
  contactType: string | null;
}> = [];

const { dbMock } = vi.hoisted(() => {
  const mock: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const chain: any = {
          where: vi.fn((clause: any) => {
            return {
              limit: vi.fn((count: number) => {
                // Determine table and return filtered data
                if (table._?.name === "user_businesses" || table.name === "user_businesses") {
                  return Promise.resolve(
                    mockBusinesses.filter((b) => (clause ? clause(b) : true)).slice(0, count)
                  );
                }
                if (table._?.name === "business_categories" || table.name === "business_categories") {
                  return Promise.resolve(
                    mockCategories.filter((c) => (clause ? clause(c) : true)).slice(0, count)
                  );
                }
                if (table._?.name === "user_contacts" || table.name === "user_contacts") {
                  return Promise.resolve(
                    mockContacts.filter((ct) => (clause ? clause(ct) : true)).slice(0, count)
                  );
                }
                return Promise.resolve([]);
              }),
            };
          }),
        };
        return chain;
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((updates: any) => ({
        where: vi.fn((clause: any) => {
          if (table._?.name === "business_categories" || table.name === "business_categories") {
            const targets = mockCategories.filter((c) => (clause ? clause(c) : true));
            for (const t of targets) {
              Object.assign(t, updates);
            }
            return Promise.resolve({ affectedRows: targets.length });
          }
          if (table._?.name === "user_contacts" || table.name === "user_contacts") {
            const targets = mockContacts.filter((c) => (clause ? clause(c) : true));
            for (const t of targets) {
              Object.assign(t, updates);
            }
            return Promise.resolve({ affectedRows: targets.length });
          }
          return Promise.resolve({ affectedRows: 0 });
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: any) => Promise.resolve({ insertId: 999 })),
    })),
    transaction: vi.fn((cb: any) => cb(mock)),
  };

  return { dbMock: mock };
});

vi.mock("./queries/connection", () => ({
  db: dbMock,
  getDb: () => dbMock,
}));

vi.mock("./lib/smart-pipeline", () => ({
  invalidateUserClassificationCache: vi.fn(),
}));

vi.mock("./lib/muscle-memory", () => ({
  invalidateUserMemory: vi.fn(),
}));

vi.mock("./lib/settings-cache", () => ({
  getSystemSettings: vi.fn().mockResolvedValue({}),
}));

describe("Security Regression: Business Router BOLA / IDOR Defenses", () => {
  beforeEach(() => {
    // Reset state before each test
    mockBusinesses = [
      { id: 10, userId: 1, userType: "oauth", name: "Tenant 1 Business", type: "retail", isActive: true },
      { id: 20, userId: 2, userType: "oauth", name: "Tenant 2 Business", type: "retail", isActive: true },
      { id: 30, userId: 1, userType: "local", name: "Tenant 1 Local Business", type: "retail", isActive: true },
      { id: 40, userId: 3, userType: "oauth", name: "Inactive Business", type: "services", isActive: false },
    ];

    mockCategories = [
      { id: 101, businessId: 10, name: "Tenant 1 Cat", type: "expense", isActive: true },
      { id: 201, businessId: 20, name: "Tenant 2 Cat", type: "expense", isActive: true },
      { id: 301, businessId: 30, name: "Tenant 1 Local Cat", type: "expense", isActive: true },
    ];

    mockContacts = [
      { id: 501, userId: 1, userType: "oauth", name: "Tenant 1 Supplier", businessId: null, contactType: null },
      { id: 502, userId: 2, userType: "oauth", name: "Tenant 2 Supplier", businessId: null, contactType: null },
      { id: 503, userId: 1, userType: "local", name: "Tenant 1 Local Supplier", businessId: null, contactType: null },
    ];

    // Mock drizzle eq / and behavior
    vi.spyOn(dbMock, "select").mockImplementation((fields?: any) => ({
      from: vi.fn((table: any) => ({
        where: vi.fn((clause: any) => ({
          limit: vi.fn((limitCount: number) => {
            const tableName = table?.dbName || table?._?.name || table?.name || "";
            if (tableName === "user_businesses" || table === userBusinesses) {
              return Promise.resolve(
                mockBusinesses.filter((b) => {
                  // Filter based on caller matching
                  return true;
                }).slice(0, limitCount)
              );
            }
            return Promise.resolve([]);
          }),
        })),
      })),
    }));
  });

  const createTenantCaller = (userId: number, userType: "oauth" | "local", plan: "pro" | "ultra" | "free" = "pro") => {
    return businessRouter.createCaller({
      user: {
        id: userId,
        name: `User ${userId}`,
        email: `user${userId}@example.com`,
        role: "user",
        plan,
        type: userType,
        phone: null,
        avatar: null,
      },
      req: new Request("http://localhost"),
      ip: "127.0.0.1",
    });
  };

  describe("updateCategory Authorization Guard", () => {
    it("rejects unauthorized tenant attempting to modify another user's business category", async () => {
      // Setup DB queries for User 1 (Tenant 1) attempting to update Category 201 (Tenant 2)
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              // userBusinesses query returns Business 10
              if (table === userBusinesses) {
                return [{ id: 10, userId: 1, userType: "oauth", isActive: true }];
              }
              // businessCategories query: Category 201 does not belong to businessId 10!
              if (table === businessCategories) {
                return []; // NOT FOUND for businessId 10
              }
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(1, "oauth", "pro");

      await expect(
        caller.updateCategory({
          id: 201,
          name: "Hacked Category Name",
          isActive: false,
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.updateCategory({
          id: 201,
          name: "Hacked Category Name",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "الفئة غير موجودة",
      });
    });

    it("rejects updateCategory when caller has no active business", async () => {
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              // No active business found for caller
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(99, "oauth", "pro");

      await expect(
        caller.updateCategory({
          id: 101,
          name: "New Name",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "لا يوجد مشروع نشط",
      });
    });

    it("enforces polymorphic userType isolation (local user cannot update oauth user's category)", async () => {
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              // Local user 1 has Business 30
              if (table === userBusinesses) {
                return [{ id: 30, userId: 1, userType: "local", isActive: true }];
              }
              // Category 101 belongs to Business 10 (OAuth user), so searching with businessId: 30 returns empty
              if (table === businessCategories) {
                return [];
              }
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(1, "local", "pro");

      await expect(
        caller.updateCategory({
          id: 101,
          name: "Local Hijack",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("allows category update when caller owns the business and category", async () => {
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === userBusinesses) {
                return [{ id: 10, userId: 1, userType: "oauth", isActive: true }];
              }
              if (table === businessCategories) {
                return [{ id: 101, businessId: 10, name: "Original", isActive: true }];
              }
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(1, "oauth", "pro");
      const result = await caller.updateCategory({
        id: 101,
        name: "Legitimately Updated Name",
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe("removeCategory Authorization Guard", () => {
    it("rejects removeCategory for category owned by another tenant", async () => {
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === userBusinesses) {
                return [{ id: 10, userId: 1, userType: "oauth", isActive: true }];
              }
              // Category 201 belongs to Business 20, not Business 10
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(1, "oauth", "pro");

      await expect(caller.removeCategory({ id: 201 })).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "الفئة غير موجودة",
      });
    });

    it("allows authorized business owner to deactivate their own category", async () => {
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === userBusinesses) {
                return [{ id: 10, userId: 1, userType: "oauth", isActive: true }];
              }
              if (table === businessCategories) {
                return [{ id: 101, businessId: 10, name: "Tenant 1 Cat", isActive: true }];
              }
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(1, "oauth", "pro");
      const result = await caller.removeCategory({ id: 101 });

      expect(result).toEqual({ success: true });
    });
  });

  describe("linkContact Authorization Guard", () => {
    it("rejects linkContact when attempting to link a contact owned by a different user (Cross-Tenant Hijack)", async () => {
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === userBusinesses) {
                return [{ id: 10, userId: 1, userType: "oauth", isActive: true }];
              }
              // Contact 502 belongs to userId 2, so userId 1 query returns empty
              if (table === userContacts) {
                return [];
              }
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(1, "oauth", "pro");

      await expect(
        caller.linkContact({
          contactId: 502,
          contactType: "business_supplier",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "جهة الاتصال غير موجودة",
      });
    });

    it("allows authorized business owner to link their own contact", async () => {
      vi.spyOn(dbMock, "select").mockImplementation(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === userBusinesses) {
                return [{ id: 10, userId: 1, userType: "oauth", isActive: true }];
              }
              if (table === userContacts) {
                return [{ id: 501, userId: 1, userType: "oauth", name: "Tenant 1 Supplier" }];
              }
              return [];
            }),
          })),
        })),
      }));

      const caller = createTenantCaller(1, "oauth", "pro");
      const result = await caller.linkContact({
        contactId: 501,
        contactType: "business_supplier",
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe("Tier Entitlement Guards", () => {
    it("rejects free tier users from accessing business procedures", async () => {
      const freeCaller = createTenantCaller(1, "oauth", "free");

      await expect(
        freeCaller.updateCategory({ id: 101, name: "Attempt" })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      await expect(
        freeCaller.removeCategory({ id: 101 })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      await expect(
        freeCaller.linkContact({ contactId: 501, contactType: "business_supplier" })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });
});
