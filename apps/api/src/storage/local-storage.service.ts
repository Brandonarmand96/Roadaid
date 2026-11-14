import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { StorageService } from './storage.interface';

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(
    file: Express.Multer.File,
    keyPrefix = 'docs',
  ): Promise<{ storageKey: string; sizeBytes: number; mimeType: string }> {
    const ext = path.extname(file.originalname) || this.extensionForMimeType(file.mimetype);
    const uniqueId = crypto.randomUUID();
    const storageKey = `${keyPrefix}/${uniqueId}${ext}`;
    const filePath = path.join(this.uploadDir, storageKey);

    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, file.buffer);

    return {
      storageKey,
      sizeBytes: file.size,
      mimeType: file.mimetype,
    };
  }

  async getSignedUrl(
    storageKey: string,
    expiresInSeconds = 300,
    metadata: { mimeType?: string; filename?: string } = {},
  ): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const secret = process.env.JWT_ACCESS_SECRET || 'fallback_secret_key_minimum_32_characters';
    const mimeType = metadata.mimeType || this.mimeTypeForPath(storageKey);
    const filename = this.safeFilename(metadata.filename || path.basename(storageKey), mimeType);
    const payload = `${storageKey}:${expiresAt}:${mimeType}:${filename}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = Buffer.from(JSON.stringify({ key: storageKey, exp: expiresAt, mimeType, filename, sig: hmac })).toString('base64url');

    const publicApiUrl = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 3000}`)
      .replace(/\/$/, '');
    return `${publicApiUrl}/v1/storage/file?token=${token}`;
  }

  async delete(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.resolveStoragePath(storageKey);
      if (!filePath) return false;
      await fs.promises.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
      return true;
    } catch (e) {
      this.logger.error(`Failed to delete local file: ${storageKey}`, e);
      return false;
    }
  }

  async verifyToken(token: string): Promise<{ filePath: string; mimeType: string; filename: string } | null> {
    try {
      const raw = Buffer.from(token, 'base64url').toString('utf-8');
      const { key, exp, mimeType, filename, sig } = JSON.parse(raw);

      if (Date.now() > exp) {
        return null;
      }

      const secret = process.env.JWT_ACCESS_SECRET || 'fallback_secret_key_minimum_32_characters';
      if (typeof mimeType !== 'string' || typeof filename !== 'string') return null;
      const payload = `${key}:${exp}:${mimeType}:${filename}`;
      const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      if (typeof sig !== 'string' || sig.length !== expectedSig.length || !crypto.timingSafeEqual(
        Buffer.from(sig, 'utf8'),
        Buffer.from(expectedSig, 'utf8'),
      )) {
        return null;
      }

      const filePath = this.resolveStoragePath(key);
      if (!filePath) return null;
      await fs.promises.access(filePath, fs.constants.R_OK);
      return {
        filePath,
        mimeType,
        filename: this.safeFilename(filename, mimeType),
      };
    } catch {
      return null;
    }
  }

  private resolveStoragePath(storageKey: unknown): string | null {
    if (typeof storageKey !== 'string' || storageKey.length === 0) return null;
    const resolved = path.resolve(this.uploadDir, storageKey);
    const prefix = `${this.uploadDir}${path.sep}`;
    return resolved.startsWith(prefix) ? resolved : null;
  }

  private extensionForMimeType(mimeType: string): string {
    return ({
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    } as Record<string, string>)[mimeType] || '';
  }

  private mimeTypeForPath(storageKey: string): string {
    return ({
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    } as Record<string, string>)[path.extname(storageKey).toLowerCase()] || 'application/octet-stream';
  }

  private safeFilename(filename: string, mimeType: string): string {
    const clean = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'document';
    return path.extname(clean) ? clean : `${clean}${this.extensionForMimeType(mimeType)}`;
  }
}
