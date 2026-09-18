/**
 * Sentry, when `SENTRY_DSN` is set: the server's errors, under the same rule as its log (golden rule 10).
 *
 * Sentry is a log kept by someone else, and by default it collects more than the log does. An error event
 * carries the last hundred `console.*` lines as breadcrumbs, and the older call sites still print content there;
 * every outgoing request with its query string, which is where `api/lib/ai-gateway.ts` puts the Gemini key
 * (`?key=`); the headers and body of the request that failed, a bank message or a code among them; and a failed
 * query's values inside the exception message. Each is removed here, before an event leaves the process.
 */
import * as Sentry from "@sentry/node";
import type { Breadcrumb, NodeOptions } from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { env } from "./env";
import { scrubErrorText } from "./log";

type SpanJSON = Parameters<NonNullable<NodeOptions["beforeSendSpan"]>>[0];

interface EventLike {
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
  };
  breadcrumbs?: Breadcrumb[];
}

/** Headers that authenticate someone; the rest (user agent, content type) help with debugging and stay. */
const SECRET_HEADER = /^(authorization|cookie|set-cookie|x-api-key|x-.*token.*)$/i;

function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

/** What Sentry itself does when asked to mask a statement: every number and every quoted string. */
function maskStatement(statement: string): string {
  return statement.replace(/\b\d+\b/g, "?").replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, "?");
}

function privateBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // A console line is already in the server log, and an older call site may have printed content in it.
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.data) {
    delete breadcrumb.data["http.query"];
    delete breadcrumb.data["http.fragment"];
    if (typeof breadcrumb.data.url === "string") breadcrumb.data.url = withoutQuery(breadcrumb.data.url);
  }
  if (typeof breadcrumb.message === "string") breadcrumb.message = scrubErrorText(breadcrumb.message);
  return breadcrumb;
}

function privateEvent<E extends EventLike>(event: E): E {
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === "string") exception.value = scrubErrorText(exception.value);
  }
  if (typeof event.message === "string") event.message = scrubErrorText(event.message);
  if (event.request) {
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.cookies;
    if (typeof event.request.url === "string") event.request.url = withoutQuery(event.request.url);
    for (const name of Object.keys(event.request.headers ?? {})) {
      if (SECRET_HEADER.test(name)) delete event.request.headers?.[name];
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((breadcrumb) => privateBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);
  }
  return event;
}

/**
 * A traced query records its statement with the values filled in. The build bundles `mysql2`, so Sentry
 * cannot trace it today; this keeps the values out if a build ever stops bundling it.
 */
function privateSpan(span: SpanJSON): SpanJSON {
  const data = span.data as Record<string, unknown> | undefined;
  if (data) {
    for (const key of ["db.statement", "db.query.text"]) {
      if (typeof data[key] === "string") data[key] = maskStatement(data[key] as string);
    }
    for (const key of ["http.query", "url.query"]) delete data[key];
    for (const key of ["url.full", "http.url", "http.target"]) {
      if (typeof data[key] === "string") data[key] = withoutQuery(data[key] as string);
    }
  }
  if (span.op?.startsWith("db") && typeof span.description === "string") {
    span.description = maskStatement(span.description);
  }
  return span;
}

/** Starts Sentry if it is configured. `api/boot.ts` calls it before anything else runs. */
export function initErrorReporting(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    sendDefaultPii: false,
    beforeBreadcrumb: (breadcrumb) => privateBreadcrumb(breadcrumb),
    beforeSend: (event) => privateEvent(event),
    beforeSendTransaction: (event) => privateEvent(event),
    beforeSendSpan: (span) => privateSpan(span),
  });
}

export const __testing = { privateBreadcrumb, privateEvent, privateSpan };
