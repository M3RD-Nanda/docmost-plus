// Enkripsi secret TOTP at-rest. AES-256-GCM, kunci diturunkan dari APP_SECRET.
// ponytail: kunci statis per-app (tanpa rotasi). Bila APP_SECRET berubah,
// semua secret MFA lama harus di-setup ulang — catat di dokumentasi rilis.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const SALT = 'docmost-plus:mfa:v1';
const VERSION = 'v1';

function key(appSecret: string): Buffer {
  return scryptSync(appSecret, SALT, 32);
}

export function encryptSecret(plaintext: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(appSecret), iv);
  const cipherText = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), authTag.toString('base64'), cipherText.toString('base64')].join(
    ':',
  );
}

export function decryptSecret(payload: string, appSecret: string): string {
  const [version, iv, authTag, cipherText] = (payload || '').split(':');
  if (version !== VERSION || !iv || !authTag || !cipherText) {
    throw new Error('Format secret MFA tidak dikenal');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(appSecret), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
