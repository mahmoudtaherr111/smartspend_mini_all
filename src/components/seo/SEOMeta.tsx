import { useEffect } from "react";
import { trpc } from "../../providers/trpc";

interface SEOMetaProps {
  path?: string;
  title?: string;
  description?: string;
}

export function SEOMeta({
  path = window.location.pathname,
  title,
  description,
}: SEOMetaProps) {
  const { data } = trpc.seo.getPage.useQuery({ path });

  useEffect(() => {
    const seo = data;
    if (!seo) return;

    document.title = title || seo.title || "SmartSpend AI";

    const setMeta = (name: string, content: string) => {
      let meta = document.querySelector(
        `meta[name="${name}"]`,
      ) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    const setProperty = (prop: string, content: string) => {
      let meta = document.querySelector(
        `meta[property="${prop}"]`,
      ) as HTMLMetaElement;
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("property", prop);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    setMeta("description", description || seo.description || "");
    setMeta("keywords", seo.keywords || "");
    setProperty("og:title", title || seo.title || "");
    setProperty("og:description", description || seo.description || "");
    setProperty("og:image", seo.ogImage || "/og-image.png");

    let canonical = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = seo.canonicalUrl || `https://smartspend.app${path}`;
  }, [data, title, description, path]);

  return null;
}
