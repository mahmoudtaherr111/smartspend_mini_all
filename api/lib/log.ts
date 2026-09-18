/**
 * The server's logger. Everything the API logs goes through here, and what must never be logged is removed on
 * the way out.
 *
 * Golden rule 10 (never log message text, codes, tokens, phone numbers or transcripts) used to depend on every
 * author remembering it across a thousand `console.*` calls, and it had failed in seven places: bank messages,
 * WhatsApp codes and senders, broadcast recipients, contact names, call transcripts and the whole Paymob
 * payload with its card data. Two things now hold it:
 *
 *   - this logger redacts those fields wherever they appear in a logged object, so a payload passed whole by
 *     mistake loses them before it is written, and it writes errors without the values they carry;
 *   - `no-console` in `eslint.config.js` sends new server logging here, while the calls that were already
 *     there are frozen in `eslint-suppressions.json` and can only go down.
 *
 * Redaction works on fields, not on text, so a message interpolated into a string is not protected: log an
 * event and identifiers (`{ event: "sms.ingested", userId, length }`), and a phone number only as
 * `phoneTail(phone)`.
 *
 * `api/lib/security-logger.ts` takes the same approach for the login-protection events it already emits.
 */
import { inspect } from "node:util";
import { DrizzleQueryError } from "drizzle-orm";
import pino, { type DestinationStream, type Logger } from "pino";
import { env } from "./env";

/**
 * Field names that carry what rule 10 forbids, at any depth of a logged object.
 *
 * `message` is deliberately absent: it is where an error keeps what went wrong, and hiding every error message
 * would make the logs useless for the thing logs are for. Message text is kept out by never logging the
 * objects that hold it (a WhatsApp message, a request body) — and if one is logged anyway, its `text`,
 * `body` and `content` are redacted here.
 */
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "phone",
  "email",
  "code",
  "otp",
  "text",
  "body",
  "transcript",
  "content",
  "pan",
  "source_data",
  "billing_data",
  "payload",
];

/** Where a phone number keeps its last four digits: enough for support to recognise it, not to dial it. */
const PHONE_FIELDS = new Set(["phone"]);

/**
 * `code` is both a verification code and an error's code (`ECONNREFUSED`, `ER_DUP_ENTRY`). Only a value with
 * a run of digits looks like the first; the second is what a person debugging needs, so it stays.
 */
const LOOKS_LIKE_A_SECRET_CODE = /\d{4,}/;

export const REDACT_PATHS = SENSITIVE_FIELDS.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]);

/** A phone number as the last four digits; anything else redacted. */
export function phoneTail(phone: string | number | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
}

function censor(value: unknown, path: string[]): unknown {
  const field = path[path.length - 1];
  if (field && PHONE_FIELDS.has(field) && (typeof value === "string" || typeof value === "number")) {
    return phoneTail(value);
  }
  if (field === "code" && typeof value === "string" && !LOOKS_LIKE_A_SECRET_CODE.test(value)) {
    return value;
  }
  return "[REDACTED]";
}

/**
 * The only properties of an error that are written besides its type, message, stack and cause: the codes and
 * addresses that say what failed. Anything else an error carries — a request with its headers, a zod issue with
 * the value it rejected, a query's parameters — stays out, including on error types nobody has seen yet.
 */
const ERROR_FIELDS = ["code", "errno", "sqlState", "syscall", "address", "port", "status", "statusCode", "query"] as const;

/** How many causes deep an error is followed. */
const MAX_CAUSES = 4;

export interface SafeError {
  type: string;
  message: string;
  stack?: string;
  cause?: SafeError;
  [field: string]: unknown;
}

/** A MySQL duplicate-key error quotes the value it refused, which is often a phone number or an email. */
const DUPLICATE_ENTRY = /Duplicate entry '[\s\S]*?'(?= for key )/g;

/** An Egyptian mobile number written anywhere in an error's text. */
const EGYPTIAN_MOBILE = /(?<!\d)(?:\+?20|0)1[0125]\d{8}(?!\d)/g;

function scrubText(text: string): string {
  return text
    .replace(DUPLICATE_ENTRY, "Duplicate entry '[REDACTED]'")
    .replace(EGYPTIAN_MOBILE, (phone) => phoneTail(phone));
}

/**
 * The same, for an error's text once the error itself is gone (a Sentry event): a failed query's values are
 * cut from where Drizzle writes them to the end.
 */
export function scrubErrorText(text: string): string {
  return scrubText(text.replace(/\nparams: [\s\S]*$/, "\nparams: [redacted]"));
}

/**
 * A failed query's message, without its values. Drizzle writes `Failed query: <sql>\nparams: <every value>`;
 * the statement with its placeholders is what says which query failed, so it stays.
 */
function messageOf(error: Error): string {
  if (error instanceof DrizzleQueryError) {
    const count = Array.isArray(error.params) ? error.params.length : 0;
    return `Failed query: ${error.query}\nparams: [${count} redacted]`;
  }
  return scrubText(error.message);
}

/** `DrizzleQueryError` leaves `name` as "Error"; its class says more. */
function labelOf(error: Error): string {
  return error.name && error.name !== "Error" ? error.name : error.constructor?.name || "Error";
}

/** The stack with the message line replaced: the header repeats the message, values included. */
function stackOf(error: Error, message: string): string | undefined {
  if (typeof error.stack !== "string") return undefined;
  const header = `${error.name}: ${error.message}`;
  const firstFrame = error.stack.search(/\n\s+at /);
  const frames = error.stack.startsWith(header)
    ? error.stack.slice(header.length)
    : firstFrame >= 0
      ? error.stack.slice(firstFrame)
      : "";
  return `${labelOf(error)}: ${message}${frames}`;
}

/**
 * An error as it may be written: what went wrong, where, and its codes, without the values it was carrying.
 *
 * A failed query is the case that matters. Drizzle's `DrizzleQueryError` puts every parameter of the query in
 * its message, and the mysql2 error inside it keeps the SQL with those values filled in (`sql`) and, for a
 * duplicate key, the value itself. During a database outage every failed write would print the row it could
 * not write — a bank message, a phone number, a code.
 *
 * Nothing on the error itself changes: code that reads `error.message` to recognise a duplicate
 * (`api/expense-router.ts`, `api/lib/subscription-service.ts`) still sees the original.
 */
export function safeError(error: unknown, depth = 0): SafeError {
  if (!(error instanceof Error)) {
    // Something thrown that is not an Error: its own message if it has one, never the object itself.
    const own = error && typeof error === "object" ? (error as { message?: unknown }).message : undefined;
    const message =
      typeof error === "string"
        ? error
        : typeof own === "string"
          ? own
          : error && typeof error === "object"
            ? "[not an Error]"
            : String(error);
    return { type: error === null ? "null" : typeof error, message: scrubText(message) };
  }
  const message = messageOf(error);
  const safe: SafeError = { type: labelOf(error), message, stack: stackOf(error, message) };
  for (const field of ERROR_FIELDS) {
    const value = (error as unknown as Record<string, unknown>)[field];
    if (typeof value === "string") safe[field] = scrubText(value);
    else if (typeof value === "number" || typeof value === "boolean") safe[field] = value;
  }
  if (error.cause !== undefined && depth < MAX_CAUSES) safe.cause = safeError(error.cause, depth + 1);
  return safe;
}

/** The same error as an `Error`, for `console.*` to print the way it prints any error. */
function printableError(error: Error, depth = 0): Error {
  const safe = safeError(error, MAX_CAUSES);
  const copy = new Error(safe.message);
  Object.defineProperty(copy, "name", { value: safe.type, enumerable: false, configurable: true });
  copy.stack = safe.stack;
  for (const field of ERROR_FIELDS) {
    if (safe[field] !== undefined) (copy as unknown as Record<string, unknown>)[field] = safe[field];
  }
  if (error.cause instanceof Error && depth < MAX_CAUSES) copy.cause = printableError(error.cause, depth + 1);
  return copy;
}

/**
 * Makes `console.*` print a failed query the same way: the call sites that predate this logger print errors
 * with `console.error("...", err)`, and there are hundreds of them. Printing goes through `util.inspect`, so
 * the redaction sits there, on the one error type that carries values, and no call site has to change.
 *
 * `api/queries/connection.ts` installs it, because every failed query comes from the connection it creates.
 */
export function hideQueryValuesFromConsole(): void {
  const prototype = DrizzleQueryError.prototype as unknown as Record<symbol, unknown>;
  if (prototype[inspect.custom]) return;
  Object.defineProperty(prototype, inspect.custom, {
    value(this: Error) {
      return printableError(this);
    },
    configurable: true,
  });
}

/**
 * A logger with the redaction in place. Tests pass their own destination to read what would be written.
 */
export function buildLogger(destination?: DestinationStream, level?: string): Logger {
  const options = {
    name: "smartspend-api",
    level: level ?? (env.NODE_ENV === "test" ? "silent" : "info"),
    base: { service: "smartspend-api" },
    redact: { paths: REDACT_PATHS, censor },
    serializers: { err: (error: unknown) => safeError(error), error: (error: unknown) => safeError(error) },
  };
  return destination ? pino(options, destination) : pino(options);
}

const root = buildLogger();

/** A logger for one part of the server, named in every line it writes. */
export function createLogger(module: string): Logger {
  return root.child({ module });
}
