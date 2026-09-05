export interface StorageUploadOptions {
  contentType?: string;
  maxSizeBytes?: number;
  metadata?: Record<string, string>;
}

export interface StorageDriver {
  upload(
    key: string,
    data: Buffer | Uint8Array,
    options?: StorageUploadOptions,
  ): Promise<string>;
  download(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}
