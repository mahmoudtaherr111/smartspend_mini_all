import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "./middleware";
import { db } from "./queries/connection";
import { seoPages } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export const seoRouter = router({
  // ─── Get Page SEO ───
  getPage: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const page = await db
        .select()
        .from(seoPages)
        .where(eq(seoPages.path, input.path))
        .limit(1);
      if (page[0]) return page[0];
      // Default SEO
      return {
        path: input.path,
        title: "SmartSpend AI - تتبع المصاريف بالذكاء الاصطناعي",
        description:
          "تطبيق ذكي لتتبع المصاريف اليومية باللهجة المصرية. حلل مصاريفك بالصوت أو الكتابة واحصل على نصائح مالية ذكية.",
        keywords: "مصاريف, تتبع, ذكاء اصطناعي, ميزانية, مصر, جنيه",
        ogImage: "/og-image.png",
        canonicalUrl: `https://smartspend.app${input.path}`,
      };
    }),

  // ─── Upsert Page SEO ───
  upsert: adminProcedure
    .input(
      z.object({
        path: z.string(),
        title: z.string(),
        description: z.string(),
        keywords: z.string().optional(),
        ogImage: z.string().optional(),
        canonicalUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await db
        .select()
        .from(seoPages)
        .where(eq(seoPages.path, input.path))
        .limit(1);
      if (existing[0]) {
        await db
          .update(seoPages)
          .set(input)
          .where(eq(seoPages.id, existing[0].id));
      } else {
        await db.insert(seoPages).values(input);
      }
      return { success: true };
    }),

  // ─── List All SEO Pages ───
  list: adminProcedure.query(async () => {
    return await db.select().from(seoPages).orderBy(seoPages.path).limit(100);
  }),

  // ─── Delete SEO Page ───
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(seoPages).where(eq(seoPages.id, input.id));
      return { success: true };
    }),

  // ─── Generate Sitemap ───
  sitemap: publicProcedure.query(async () => {
    const pages = await db
      .select({ path: seoPages.path, updatedAt: seoPages.updatedAt })
      .from(seoPages);
    const staticRoutes = ["/", "/login", "/support", "/admin", "/pro"];
    const allPaths = [...staticRoutes, ...pages.map((p) => p.path)];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPaths
  .map(
    (path) => `  <url>
    <loc>https://smartspend.app${path}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === "/" ? "1.0" : "0.8"}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;
    return xml;
  }),
});
