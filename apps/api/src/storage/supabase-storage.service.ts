import { BadGatewayException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { StorageService } from './storage.interface';

@Injectable()
export class SupabaseStorageService implements StorageService {
  private readonly baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  private readonly bucket = process.env.SUPABASE_STORAGE_BUCKET || 'provider-documents';

  async upload(file: Express.Multer.File, keyPrefix = 'docs') {
    const storageKey = `${keyPrefix}/${crypto.randomUUID()}${path.extname(file.originalname)}`;
    const response = await fetch(this.objectUrl(storageKey), {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': file.mimetype, 'x-upsert': 'false' },
      body: new Uint8Array(file.buffer),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new BadGatewayException({ code: 'STORAGE_UPLOAD_FAILED', message: 'Document storage is temporarily unavailable' });
    return { storageKey, sizeBytes: file.size, mimeType: file.mimetype };
  }

  async getSignedUrl(storageKey: string, expiresInSeconds = 300) {
    const response = await fetch(`${this.requireBaseUrl()}/storage/v1/object/sign/${this.bucket}/${this.safeKey(storageKey)}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await response.json().catch(() => ({})) as { signedURL?: string; signedUrl?: string };
    const signed = json.signedURL ?? json.signedUrl;
    if (!response.ok || !signed) throw new BadGatewayException({ code: 'STORAGE_SIGN_FAILED', message: 'Document preview is temporarily unavailable' });
    return signed.startsWith('http') ? signed : `${this.requireBaseUrl()}/storage/v1${signed.startsWith('/') ? signed : `/${signed}`}`;
  }

  async delete(storageKey: string) {
    const response = await fetch(this.objectUrl(storageKey), { method: 'DELETE', headers: this.headers(), signal: AbortSignal.timeout(10_000) });
    return response.ok || response.status === 404;
  }

  private objectUrl(storageKey: string) {
    return `${this.requireBaseUrl()}/storage/v1/object/${this.bucket}/${this.safeKey(storageKey)}`;
  }

  private safeKey(storageKey: string) {
    return storageKey.split('/').map(encodeURIComponent).join('/');
  }

  private requireBaseUrl() {
    if (!this.baseUrl || !this.serviceKey) throw new Error('Supabase storage is not configured');
    return this.baseUrl;
  }

  private headers() {
    this.requireBaseUrl();
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey as string };
  }
}
