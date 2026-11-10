/**
 * The real logo of each known service (decision 0051): fetched by the server from the service's own Google Play listing
 * (the app icon people know) or, without an app, from its official site's icon, stored once through the storage
 * driver and served from `/api/brand-logos/<file>`. Nothing is bundled in the repository, and a phone never asks a
 * third party for a logo. An admin's own `logo_url` always wins over a fetched one.
 *
 * Every fetch is an https request to a public host, followed through at most three checked redirects, with a time and
 * size limit; only PNG, JPEG, WebP, GIF and ICO bytes are kept (never SVG, which could carry script).
 */
import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { subscriptionCatalog } from "../../../db/schema";
import { db } from "../../queries/connection";
import { getStorageDriver } from "../../services/storage";
import { createLogger } from "../log";
import { invalidateCaptureCatalog } from "./catalog";

const log = createLogger("brand-logos");

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36";
const PAGE_LIMIT = 1_500_000;
const IMAGE_LIMIT = 600_000;
/** A failed try waits this long before the next; a fetched logo is refreshed after this long. */
const RETRY_AFTER_DAYS = 7;
const REFRESH_AFTER_DAYS = 90;

export type ImageKind = { ext: "png" | "jpg" | "webp" | "gif" | "ico"; contentType: string };

/** What an image's first bytes say it is; null for anything else (HTML, SVG, garbage). */
export function imageKind(bytes: Uint8Array): ImageKind | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", contentType: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", contentType: "image/jpeg" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { ext: "webp", contentType: "image/webp" };
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: "gif", contentType: "image/gif" };
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return { ext: "ico", contentType: "image/x-icon" };
  return null;
}

/** A host the server may fetch: a public DNS name, never an address, localhost or an internal name. */
export function isPublicHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) return false; // also rejects IPv6 literals
  if (/^\d+(\.\d+){3}$/.test(name)) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(name);
}

/** GET with checked redirects, a time limit and a size limit. */
async function safeGet(url: string, limit: number, accept: string): Promise<{ url: string; bytes: Uint8Array } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const parsed = new URL(current);
    if (parsed.protocol !== "https:" || !isPublicHost(parsed.hostname) || (parsed.port && parsed.port !== "443")) return null;
    const res = await fetch(current, { redirect: "manual", headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      current = new URL(next, current).toString();
      continue;
    }
    if (!res.ok || !res.body) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > limit) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > limit) return null;
      chunks.push(chunk);
    }
    return { url: current, bytes: Buffer.concat(chunks) };
  }
  return null;
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
const decode = (value: string) => value.replace(/&amp;/g, "&");

/** The app icon of a Google Play listing page, asked for at 256 px. */
export function playIconFrom(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0];
  const url = og ? attr(og, "content") : null;
  if (!url || !/^https:\/\/play-lh\.googleusercontent\.com\//.test(url)) return null;
  return `${decode(url).replace(/=[^/]*$/, "")}=s256`;
}

/** The best icon a site's page names: an apple-touch-icon, else the largest raster icon, else the usual paths. */
export function siteIconsFrom(html: string, pageUrl: string): string[] {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const scored: Array<{ href: string; score: number }> = [];
  for (const tag of links) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/(^|\s)(apple-touch-icon|apple-touch-icon-precomposed|icon|shortcut icon)(\s|$)/.test(rel)) continue;
    if (/\.svg(\?|$)/i.test(href) || /svg/i.test(attr(tag, "type") ?? "")) continue;
    const size = Number((attr(tag, "sizes") ?? "").split("x")[0]) || (rel.includes("apple") ? 180 : 32);
    scored.push({ href: decode(href), score: (rel.includes("apple") ? 1000 : 0) + size });
  }
  scored.sort((a, b) => b.score - a.score);
  const urls = scored.map((item) => new URL(item.href, pageUrl).toString());
  const origin = new URL(pageUrl).origin;
  return [...new Set([...urls, `${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`])];
}

/** Width of an image from its header (PNG, JPEG, WebP, GIF, the largest entry of an ICO); 0 when unknown. */
export function imageWidth(bytes: Uint8Array): number {
  const kind = imageKind(bytes);
  if (!kind) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    switch (kind.ext) {
      case "png":
        return view.getUint32(16);
      case "gif":
        return view.getUint16(6, true);
      case "ico": {
        let best = 0;
        const count = view.getUint16(4, true);
        for (let index = 0; index < count && 6 + index * 16 < bytes.length; index += 1) best = Math.max(best, bytes[6 + index * 16] || 256);
        return best;
      }
      case "webp": {
        const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
        if (chunk === "VP8X") return 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        if (chunk === "VP8L") return 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
        return view.getUint16(26, true) & 0x3fff;
      }
      case "jpg": {
        let offset = 2;
        while (offset + 9 < bytes.length) {
          if (bytes[offset] !== 0xff) return 0;
          const marker = bytes[offset + 1];
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return view.getUint16(offset + 7);
          offset += 2 + view.getUint16(offset + 2);
        }
        return 0;
      }
    }
  } catch {
    return 0;
  }
}

/** The largest square logo of a Microsoft Store listing (an official app such as Apple's iCloud for Windows). */
async function msStoreIcon(id: string): Promise<string | null> {
  if (!/^[A-Z0-9]{12}$/.test(id)) return null;
  const page = await safeGet(`https://storeedgefd.dsx.mp.microsoft.com/v9.0/products/${id}?market=EG&locale=en-us&deviceFamily=Windows.Desktop`, PAGE_LIMIT, "application/json").catch(() => null);
  if (!page) return null;
  try {
    const images = (JSON.parse(new TextDecoder().decode(page.bytes)) as { Payload?: { Images?: Array<{ ImageType?: string; Width?: number; Height?: number; Url?: string }> } }).Payload?.Images ?? [];
    const logos = images.filter((image) => image.ImageType === "logo" && image.Width === image.Height && image.Url?.startsWith("https://"));
    logos.sort((a, b) => (b.Width ?? 0) - (a.Width ?? 0));
    return logos[0]?.Url ?? null;
  } catch {
    return null;
  }
}

/** Below this width a logo looks blurred on a phone; a sharper source is preferred when there is one. */
const SHARP_WIDTH = 128;

/**
 * The service's real icon from its own official listings: Google Play, then the Microsoft Store, then its site. The
 * first sharp one wins; otherwise the largest found. Null when none gives a usable image.
 */
export async function fetchBrandLogo(row: { appPackage: string | null; website: string | null; msStoreId?: string | null }): Promise<{ bytes: Uint8Array; kind: ImageKind } | null> {
  const sources: Array<() => Promise<string[]>> = [];
  if (row.appPackage) {
    sources.push(async () => {
      const page = await safeGet(`https://play.google.com/store/apps/details?id=${encodeURIComponent(row.appPackage!)}&hl=en`, PAGE_LIMIT, "text/html").catch(() => null);
      const icon = page ? playIconFrom(new TextDecoder().decode(page.bytes)) : null;
      return icon ? [icon] : [];
    });
  }
  if (row.msStoreId) sources.push(async () => { const icon = await msStoreIcon(row.msStoreId!); return icon ? [icon] : []; });
  if (row.website && isPublicHost(row.website)) {
    sources.push(async () => {
      const page = await safeGet(`https://${row.website}/`, PAGE_LIMIT, "text/html").catch(() => null);
      return page ? siteIconsFrom(new TextDecoder().decode(page.bytes), page.url).slice(0, 4) : [];
    });
  }
  let best: { bytes: Uint8Array; kind: ImageKind; width: number } | null = null;
  for (const source of sources) {
    for (const url of await source().catch(() => [] as string[])) {
      const image = await safeGet(url, IMAGE_LIMIT, "image/*").catch(() => null);
      const kind = image ? imageKind(image.bytes) : null;
      if (!image || !kind) continue;
      const width = imageWidth(image.bytes);
      if (width >= SHARP_WIDTH) return { bytes: image.bytes, kind };
      if (!best || width > best.width) best = { bytes: image.bytes, kind, width };
    }
  }
  return best ? { bytes: best.bytes, kind: best.kind } : null;
}

/** The file name a stored logo is served under; anything else is refused by the route. */
export const BRAND_LOGO_FILE = /^[a-z0-9_]{2,60}-[0-9a-f]{12}\.(png|jpg|webp|gif|ico)$/;

/** Fetches and stores one service's logo; true when it now has one. A failure keeps the logo it had. */
export async function refreshBrandLogo(id: number): Promise<boolean> {
  const [row] = await db.select().from(subscriptionCatalog).where(eq(subscriptionCatalog.id, id)).limit(1);
  if (!row) return false;
  const now = new Date();
  try {
    const logo = await fetchBrandLogo(row);
    if (!logo) {
      await db.update(subscriptionCatalog).set({ logoFetchedAt: now }).where(eq(subscriptionCatalog.id, id));
      log.info({ event: "brand_logo.not_found", slug: row.slug }, "No logo found for a service");
      return !!row.fetchedLogoUrl;
    }
    const hash = crypto.createHash("sha256").update(logo.bytes).digest("hex").slice(0, 12);
    const file = `${row.slug}-${hash}.${logo.kind.ext}`;
    await getStorageDriver().upload(`brand-logos/${file}`, Buffer.from(logo.bytes), { contentType: logo.kind.contentType, maxSizeBytes: IMAGE_LIMIT });
    await db.update(subscriptionCatalog).set({ fetchedLogoUrl: `/api/brand-logos/${file}`, logoFetchedAt: now }).where(eq(subscriptionCatalog.id, id));
    await invalidateCaptureCatalog();
    return true;
  } catch (err) {
    await db.update(subscriptionCatalog).set({ logoFetchedAt: now }).where(eq(subscriptionCatalog.id, id)).catch(() => undefined);
    log.warn({ err, event: "brand_logo.failed", slug: row.slug }, "Fetching a service's logo failed");
    return !!row.fetchedLogoUrl;
  }
}

/** The daily job: services with no logo yet (a failed try waits a week) and logos older than 90 days. */
export async function refreshMissingBrandLogos(limit = 60, now = new Date()): Promise<{ tried: number; fetched: number }> {
  const retry = new Date(now.getTime() - RETRY_AFTER_DAYS * 86_400_000);
  const stale = new Date(now.getTime() - REFRESH_AFTER_DAYS * 86_400_000);
  const services = await db.select({ id: subscriptionCatalog.id, fetchedLogoUrl: subscriptionCatalog.fetchedLogoUrl, logoFetchedAt: subscriptionCatalog.logoFetchedAt })
    .from(subscriptionCatalog)
    // App stores are not offered as subscriptions: a charge through one is asked about, so they need no logo.
    .where(and(eq(subscriptionCatalog.status, "active"), eq(subscriptionCatalog.kind, "service")))
    .orderBy(asc(subscriptionCatalog.id));
  const driver = getStorageDriver();
  const due: number[] = [];
  for (const row of services) {
    const tried = row.logoFetchedAt?.getTime() ?? 0;
    if (!row.fetchedLogoUrl) {
      if (tried < retry.getTime()) due.push(row.id);
      continue;
    }
    // A logo kept on the server's own disk is gone after a redeploy: fetched again, whatever its age.
    const file = row.fetchedLogoUrl.split("/").pop() ?? "";
    const kept = BRAND_LOGO_FILE.test(file) && await driver.exists(`brand-logos/${file}`).catch(() => false);
    if (!kept || tried < stale.getTime()) due.push(row.id);
  }
  const rows = due.slice(0, limit).map((id) => ({ id }));
  let fetched = 0;
  for (const row of rows) if (await refreshBrandLogo(row.id)) fetched += 1;
  if (rows.length) log.info({ event: "brand_logo.job", tried: rows.length, fetched }, "Service logos refreshed");
  return { tried: rows.length, fetched };
}

/** The logo a client shows: the admin's own, else the fetched one, else none (the app draws the brand's initials). */
export const logoOf = (row: { logoUrl?: string | null; fetchedLogoUrl?: string | null }): string | null => row.logoUrl || row.fetchedLogoUrl || null;
