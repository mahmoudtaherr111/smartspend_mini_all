// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

/**
 * The site is a reader's view of `docs/`, not a second copy of it: `scripts/collect.mjs` pulls the pages in at
 * build time. Arabic is the root language because the person this site exists for reads Arabic; the English
 * pages stay reachable under their own paths for anyone working on the code.
 *
 * `build.format: "file"` writes `systems/admin.html` instead of `systems/admin/index.html`, so the built
 * folder can be opened by a person with a file manager as well as served.
 */
export default defineConfig({
  outDir: "./dist",
  build: { format: "file" },
  integrations: [
    starlight({
      title: "SmartSpend",
      defaultLocale: "root",
      locales: {
        root: { label: "العربية", lang: "ar", dir: "rtl" },
      },
      pagination: false,
      lastUpdated: false,
      components: {
        // Renders the Mermaid diagrams the pages already carry, bundled rather than fetched, so the built
        // site works with no network.
        Head: "./src/components/Head.astro",
      },
      sidebar: [
        { label: "ابدأ من هنا", link: "/" },
        {
          label: "الأنظمة بالعربي",
          autogenerate: { directory: "ar/systems" },
          collapsed: false,
        },
        { label: "الدليل بالعربي", autogenerate: { directory: "ar" }, collapsed: true },
        {
          label: "حالة المشروع",
          items: [
            { label: "الحالة والمشاكل (عربي)", link: "/atlas/systems/state.ar/" },
            { label: "Project state (English)", link: "/atlas/systems/state/" },
            { label: "الخريطة التفاعلية", link: "/map/index.html", attrs: { target: "_blank" } },
          ],
        },
        { label: "System pages (English)", autogenerate: { directory: "systems" }, collapsed: true },
        { label: "Generated facts", autogenerate: { directory: "atlas" }, collapsed: true },
        { label: "Guides and decisions", autogenerate: { directory: "guides" }, collapsed: true },
      ],
    }),
  ],
});
