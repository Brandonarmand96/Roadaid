export interface StorageService {
  upload(file: Express.Multer.File, keyPrefix?: string): Promise<{ storageKey: string; sizeBytes: number; mimeType: string }>;
  getSignedUrl(
    storageKey: string,
    expiresInSeconds?: number,
    metadata?: { mimeType?: string; filename?: string },
  ): Promise<string>;
  delete(storageKey: string): Promise<boolean>;
}
