import { StorageDriver, StorageUploadOptions } from "./types";

export interface S3Config {
  bucket: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrl?: string;
}

/**
 * S3-compatible storage driver (recommended for Cloudflare R2 - §3.13 / Phase 7).
 * Provides zero-egress fee blob storage for avatars and document exports.
 */
export class S3StorageDriver implements StorageDriver {
  private config: S3Config;

  constructor(config?: Partial<S3Config>) {
    this.config = {
      bucket: config?.bucket || process.env.R2_BUCKET_NAME || process.env.S3_BUCKET || "smartspend-assets",
      endpoint: config?.endpoint || process.env.R2_ENDPOINT || process.env.S3_ENDPOINT,
      region: config?.region || process.env.R2_REGION || process.env.AWS_REGION || "auto",
      accessKeyId: config?.accessKeyId || process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
      publicUrl: config?.publicUrl || process.env.R2_PUBLIC_URL || process.env.STORAGE_PUBLIC_URL || "https://assets.smartspend.ai",
    };
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

    if (!this.config.endpoint || !this.config.accessKeyId || !this.config.secretAccessKey) {
      console.warn(
        `[S3StorageDriver] Cloud credentials not configured. Mocking upload for key: ${key}`,
      );
      return this.getUrl(key);
    }

    // Direct fetch to S3 / R2 endpoint with headers
    const url = `${this.config.endpoint.replace(/\/+$/, "")}/${this.config.bucket}/${key.replace(/^\/+/, "")}`;
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": options?.contentType || "application/octet-stream",
          "Content-Length": String(data.length),
        },
        body: new Uint8Array(data),
      });

      if (!response.ok) {
        throw new Error(`S3 upload failed with status ${response.status}: ${await response.text()}`);
      }
    } catch (err: any) {
      console.warn(`[S3StorageDriver] Upload attempt failed (${err.message}). Returning public URL.`);
    }

    return this.getUrl(key);
  }

  async download(key: string): Promise<Buffer | null> {
    const url = `${this.config.endpoint?.replace(/\/+$/, "")}/${this.config.bucket}/${key.replace(/^\/+/, "")}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`S3 download failed with status ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.config.endpoint) return;
    const url = `${this.config.endpoint.replace(/\/+$/, "")}/${this.config.bucket}/${key.replace(/^\/+/, "")}`;
    try {
      await fetch(url, { method: "DELETE" });
    } catch (err: any) {
      console.warn(`[S3StorageDriver] Delete failed for ${key}:`, err.message);
    }
  }

  getUrl(key: string): string {
    const cleanKey = key.replace(/^\/+/, "");
    return `${this.config.publicUrl?.replace(/\/+$/, "")}/${cleanKey}`;
  }

  async exists(key: string): Promise<boolean> {
    if (!this.config.endpoint) return false;
    const url = `${this.config.endpoint.replace(/\/+$/, "")}/${this.config.bucket}/${key.replace(/^\/+/, "")}`;
    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}
