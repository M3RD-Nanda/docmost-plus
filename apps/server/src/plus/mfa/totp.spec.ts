import { base32Encode, totpCode, verifyTotp } from './totp';
import { decryptSecret, encryptSecret } from './mfa-crypto';

// Vektor uji resmi RFC 6238 (SHA-1, 8 digit, seed ASCII "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('totp', () => {
  it('cocok dengan vektor RFC 6238', () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      expect(totpCode(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
    }
  });

  it('menerima kode pada langkah sekarang dan menolak kode ngawur', () => {
    const secret = base32Encode(Buffer.from('docmost-plus-test-seed', 'ascii'));
    const now = 1_767_000_000_000;
    const valid = totpCode(secret, Math.floor(now / 1000 / 30));
    expect(verifyTotp(secret, valid, 1, now)).toBe(true);
    expect(verifyTotp(secret, '000000', 1, now)).toBe(false);
    expect(verifyTotp(secret, '12345', 1, now)).toBe(false);
  });
});

describe('mfa-crypto', () => {
  it('bolak-balik utuh dan gagal bila APP_SECRET berbeda', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const box = encryptSecret(secret, 'app-secret-a');
    expect(box.startsWith('v1:')).toBe(true);
    expect(decryptSecret(box, 'app-secret-a')).toBe(secret);
    expect(() => decryptSecret(box, 'app-secret-b')).toThrow();
  });
});
