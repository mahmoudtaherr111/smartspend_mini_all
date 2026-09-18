/** The Cloudflare Turnstile site key, set at build time; without it the sign-up form shows no widget. */
export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;
