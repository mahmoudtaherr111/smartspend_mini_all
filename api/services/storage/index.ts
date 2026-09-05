import { LocalStorageDriver } from "./local-driver";
import { S3StorageDriver } from "./s3-driver";
import { StorageDriver } from "./types";

export * from "./types";
export * from "./local-driver";
export * from "./s3-driver";

let globalDriver: StorageDriver | null = null;

/**
 * Resolves the configured storage driver (§3.13 / Phase 7).
 * Defaults to LocalStorageDriver for development (zero external cloud dependencies).
 * Uses S3StorageDriver when R2_BUCKET_NAME or STORAGE_DRIVER="s3" is set.
 */
export function getStorageDriver(): StorageDriver {
  if (globalDriver) return globalDriver;

  const driverType = process.env.STORAGE_DRIVER?.toLowerCase();
  const hasR2 = Boolean(process.env.R2_BUCKET_NAME && process.env.R2_ENDPOINT);

  if (driverType === "s3" || hasR2) {
    globalDriver = new S3StorageDriver();
  } else {
    globalDriver = new LocalStorageDriver();
  }

  return globalDriver;
}

/**
 * For test isolation: override the active storage driver.
 */
export function setStorageDriver(driver: StorageDriver | null): void {
  globalDriver = driver;
}
