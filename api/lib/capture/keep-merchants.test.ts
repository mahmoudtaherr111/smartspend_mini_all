/** Every message is invented; the repository is public. */
import { describe, expect, it } from "vitest";
import { redactWithFindings } from "../anonymizer";
import { merchantNamesToKeep, redactKeeping } from "./keep-merchants";

const purchase = (name: string | null) => ({ kind: "card_purchase", counterparty: name ? { type: "merchant", name } : null });

describe("redaction for the model keeps the merchant", () => {
  it("keeps a merchant the reader named after من, which the general redaction removes", () => {
    const text = "تم خصم 250 جنيه من بطاقتك 1234 من CARREFOUR MAADI";
    expect(redactWithFindings(text).text).not.toContain("CARREFOUR");
    const kept = redactKeeping(text, merchantNamesToKeep(text, purchase("CARREFOUR MAADI")));
    expect(kept.text).toContain("CARREFOUR MAADI");
    expect(kept.text).not.toContain("1234");
  });

  it("keeps a gateway merchant, a domain and an Arabic shop name even when the reader found none", () => {
    const text = "Purchase of EGP 99 from PAYMOB*CAIRO STORE via netflix.com and صيدلية العزبي";
    expect(merchantNamesToKeep(text, purchase(null))).toEqual(expect.arrayContaining(["PAYMOB*CAIRO STORE", "netflix.com", "صيدلية العزبي"]));
  });

  it("keeps no name in a transfer to a person", () => {
    const text = "تم تحويل 500 جنيه إلى AHMED ALI عبر انستاباي";
    const keep = merchantNamesToKeep(text, { kind: "transfer_out", counterparty: { type: "person", name: "AHMED ALI" } });
    expect(keep).toEqual([]);
    expect(redactKeeping(text, keep).text).toContain("[REDACTED_NAME]");
  });
});
