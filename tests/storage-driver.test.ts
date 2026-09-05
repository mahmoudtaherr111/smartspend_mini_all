import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalStorageDriver } from "../api/services/storage/local-driver";
import { storeUserAvatar } from "../api/services/storage/avatar-service";
import { setStorageDriver } from "../api/services/storage";
import path from "path";
import fs from "fs/promises";

describe("Object Storage Abstraction (P7)", () => {
  const testDir = path.resolve(process.cwd(), "storage", "test_uploads");
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    driver = new LocalStorageDriver(testDir, "/test-uploads");
    setStorageDriver(driver);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    setStorageDriver(null);
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("uploads, downloads, checks existence, and deletes data locally", async () => {
    const key = "test/sample.txt";
    const content = Buffer.from("Hello SmartSpend Storage!", "utf8");

    const url = await driver.upload(key, content, { contentType: "text/plain" });
    expect(url).toBe("/test-uploads/test/sample.txt");

    const exists = await driver.exists(key);
    expect(exists).toBe(true);

    const downloaded = await driver.download(key);
    expect(downloaded).not.toBeNull();
    expect(downloaded!.toString("utf8")).toBe("Hello SmartSpend Storage!");

    await driver.delete(key);
    const existsAfterDelete = await driver.exists(key);
    expect(existsAfterDelete).toBe(false);

    const notFound = await driver.download(key);
    expect(notFound).toBeNull();
  });

  it("stores avatar ensuring size target ≤ 30 KB (P7 Gate)", async () => {
    // 5 KB avatar dummy payload
    const smallAvatar = Buffer.alloc(5 * 1024, 0x42);
    const result = await storeUserAvatar(101, "oauth", smallAvatar);

    expect(result.key).toMatch(/^avatars\/oauth_101_[a-f0-9]+\.webp$/);
    expect(result.url).toContain("avatars/oauth_101_");
    expect(result.byteSize).toBe(5 * 1024);
    expect(result.byteSize).toBeLessThanOrEqual(30 * 1024);

    // Verify file was written to disk
    const exists = await driver.exists(result.key);
    expect(exists).toBe(true);
  });

  it("rejects avatar payloads exceeding maximum size limits", async () => {
    const hugeAvatar = Buffer.alloc(3 * 1024 * 1024, 0x42);
    await expect(
      storeUserAvatar(102, "local", hugeAvatar),
    ).rejects.toThrow(/exceeds maximum upload limit/);
  });
});
