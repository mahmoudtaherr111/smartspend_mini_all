import { promises as fs } from "fs";
import path from "path";
import { StorageDriver, StorageUploadOptions } from "./types";

export class LocalStorageDriver implements StorageDriver {
  private baseDir: string;
  private publicBaseUrl: string;

  constructor(
    baseDir = path.resolve(process.cwd(), "storage", "uploads"),
    publicBaseUrl = "/uploads",
  ) {
    this.baseDir = baseDir;
    this.publicBaseUrl = publicBaseUrl;
  }

  private resolvePath(key: string): string {
    const safeKey = key.replace(/\.\./g, "").replace(/^[/\\]+/, "");
    return path.join(this.baseDir, safeKey);
  }

  async upload(
    key: string,
    data: Buffer | Uint8Array,
    options?: StorageUploadOptions,
  ): Promise<string> {
    if (options?.maxSizeBytes && data.length > options.maxSizeBytes) {
      throw new Error(
        `Payload size (${data.length} bytes) exceeds allowed maximum (${options.maxSizeBytes} bytes)`,
      );
    }

    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);

    return this.getUrl(key);
  }

  async download(key: string): Promise<Buffer | null> {
    const filePath = this.resolvePath(key);
    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  getUrl(key: string): string {
    const safeKey = key.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${this.publicBaseUrl}/${safeKey}`;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
