/**
 * Golden rule 10, held by the logger itself: whatever a caller passes, the line written must not carry message
 * text, a verification code, a token, a phone number, a transcript or card data.
 */
import { Writable } from "node:stream";
import { inspect } from "node:util";
import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { __testing as sentry } from "../../api/lib/error-reporting";
import { buildLogger, hideQueryValuesFromConsole, phoneTail, safeError } from "../../api/lib/log";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { logger: buildLogger(stream, "info"), lines };
}

describe("the server logger", () => {
  it("never writes the things rule 10 names, whatever object it is handed", () => {
    const { logger, lines } = capture();
    logger.info(
      {
        phone: "+201012345678",
        code: "SS-482913",
        token: "eyJhbGciOiJIUzI1NiJ9.secret",
        text: "دفعت 250 جنيه لأحمد",
        transcript: "صرفت 500 على الأكل",
        obj: { source_data: { pan: "5123-45XX-XXXX-0008" }, billing_data: { email: "person@example.com" } },
        nested: { body: "raw request body", content: "a WhatsApp message" },
      },
      "handed everything by mistake",
    );

    const written = lines.join("");
    for (const secret of [
      "+201012345678",
      "01012345678",
      "SS-482913",
      "482913",
      "eyJhbGciOiJIUzI1NiJ9.secret",
      "دفعت 250 جنيه لأحمد",
      "صرفت 500 على الأكل",
      "5123-45XX-XXXX-0008",
      "person@example.com",
      "raw request body",
      "a WhatsApp message",
    ]) {
      expect(written).not.toContain(secret);
    }
  });

  it("keeps the last four digits of a phone, which support can use and nobody can dial", () => {
    const { logger, lines } = capture();
    logger.info({ phone: "+201012345678" }, "sender");
    expect(lines.join("")).toContain("***5678");
  });

  it("keeps what someone debugging needs: the error's message and its code", () => {
    const { logger, lines } = capture();
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), { code: "ECONNREFUSED" });
    logger.error({ err: error, event: "redis.connect.failed" }, "Redis is down");

    const written = lines.join("");
    expect(written).toContain("connect ECONNREFUSED 127.0.0.1:6379");
    expect(written).toContain('"code":"ECONNREFUSED"');
    expect(written).toContain("redis.connect.failed");
  });
});

/**
 * A write that fails the way it does in production: Drizzle wraps the mysql2 error and puts every parameter
 * in its own message, and mysql2 keeps the SQL with the values filled in.
 */
function failedWrite() {
  const cause = Object.assign(new Error("Duplicate entry '01012345678' for key 'local_users.phone'"), {
    code: "ER_DUP_ENTRY",
    errno: 1062,
    sqlState: "23000",
    sqlMessage: "Duplicate entry '01012345678' for key 'local_users.phone'",
    sql: "insert into `raw_sms_events` values ('دفعت 250 جنيه لأحمد', '01012345678')",
  });
  return new DrizzleQueryError(
    "insert into `raw_sms_events` (`message`, `sender`) values (?, ?)",
    ["دفعت 250 جنيه لأحمد", "01012345678"],
    cause,
  );
}

const ROW = ["دفعت 250 جنيه لأحمد", "01012345678"];

describe("a failed query", () => {
  it("is logged with its statement and codes, and without the row it was writing", () => {
    const { logger, lines } = capture();
    logger.error({ err: failedWrite(), event: "sms.raw.record_failed" }, "Could not record a bank message");

    const written = lines.join("");
    for (const value of ROW) expect(written).not.toContain(value);
    expect(written).toContain("Failed query: insert into `raw_sms_events`");
    expect(written).toContain("params: [2 redacted]");
    expect(written).toContain("ER_DUP_ENTRY");
    expect(written).toContain("local_users.phone");
    expect(written).toContain("DrizzleQueryError");
  });

  it("prints the same way through console.*, which the older call sites still use", () => {
    hideQueryValuesFromConsole();
    const printed = inspect(failedWrite());

    for (const value of ROW) expect(printed).not.toContain(value);
    expect(printed).toContain("Failed query: insert into `raw_sms_events`");
    expect(printed).toContain("ER_DUP_ENTRY");
    expect(printed).toContain("Duplicate entry '[REDACTED]' for key 'local_users.phone'");
  });

  it("leaves the error itself alone, so code that recognises a duplicate by its message still does", () => {
    hideQueryValuesFromConsole();
    const error = failedWrite();
    inspect(error);

    expect(error.message).toContain("01012345678");
    expect((error.cause as Error).message).toContain("Duplicate entry '01012345678'");
    expect(error.params).toEqual(ROW);
  });

  it("writes only codes and addresses from whatever else an error carries", () => {
    const error = Object.assign(new Error("Request failed with status code 401"), {
      status: 401,
      config: { headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.secret" } },
      issues: [{ received: "01012345678" }],
    });
    const safe = safeError(error);

    expect(safe.status).toBe(401);
    expect(JSON.stringify(safe)).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(JSON.stringify(safe)).not.toContain("01012345678");
  });

  it("never writes a thrown object that is not an Error", () => {
    expect(safeError({ phone: "01012345678", text: "دفعت 250" }).message).toBe("[not an Error]");
    expect(safeError("call +201012345678 failed").message).toBe("call ***5678 failed");
  });
});

describe("what reaches Sentry", () => {
  it("drops console lines and the query strings of outgoing requests", () => {
    expect(sentry.privateBreadcrumb({ category: "console", message: "[WhatsApp] Code SS-482913" })).toBeNull();

    const request = sentry.privateBreadcrumb({
      category: "http",
      data: { url: "https://generativelanguage.googleapis.com/v1beta/models", "http.query": "?key=AIzaSyA-secret" },
    });
    expect(JSON.stringify(request)).not.toContain("AIzaSyA-secret");
    expect(request?.data?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
  });

  it("sends an error without the failed query's values, the request body or the caller's credentials", () => {
    const event = sentry.privateEvent({
      exception: {
        values: [{ value: "Failed query: insert into `raw_sms_events` values (?, ?)\nparams: دفعت 250 جنيه,01012345678" }],
      },
      request: {
        url: "https://app.example/api/sms/ingest?token=secret-token",
        query_string: "token=secret-token",
        data: { message: "دفعت 250 جنيه لأحمد" },
        cookies: { google_session: "cookie-value" },
        headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.secret", "user-agent": "okhttp" },
      },
      breadcrumbs: [{ category: "console", message: "Cleaned Sender Phone: 01012345678" }],
    });

    const sent = JSON.stringify(event);
    for (const value of ["دفعت 250", "01012345678", "secret-token", "cookie-value", "eyJhbGciOiJIUzI1NiJ9"]) {
      expect(sent).not.toContain(value);
    }
    expect(event.exception?.values?.[0]?.value).toContain("Failed query: insert into `raw_sms_events`");
    expect(event.request?.headers?.["user-agent"]).toBe("okhttp");
    expect(event.breadcrumbs).toEqual([]);
  });

  it("masks the values of a traced query", () => {
    const span = sentry.privateSpan({
      span_id: "1",
      trace_id: "2",
      start_timestamp: 0,
      op: "db",
      description: "insert into raw_sms_events values ('دفعت 250', '01012345678')",
      data: { "db.statement": "insert into raw_sms_events values ('دفعت 250', '01012345678')" },
    } as Parameters<typeof sentry.privateSpan>[0]);

    expect(JSON.stringify(span)).not.toContain("01012345678");
    expect(span.data?.["db.statement"]).toBe("insert into raw_sms_events values (?, ?)");
  });
});

describe("phoneTail", () => {
  it("shows four digits at most, and nothing for a value too short to be a number", () => {
    expect(phoneTail("+20 101 234 5678")).toBe("***5678");
    expect(phoneTail("12")).toBe("***");
    expect(phoneTail(null)).toBe("***");
  });
});
