import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

function formatPemKey(rawKey, type) {
  if (!rawKey) return '';
  if (rawKey.includes('-----BEGIN')) return rawKey;
  const clean = rawKey.replace(/\s+/g, '');
  const chunks = clean.match(/.{1,64}/g) || [];
  return `-----BEGIN ${type}-----\n${chunks.join('\n')}\n-----END ${type}-----`;
}

// Load merchant private key from file path or fallback to env string
let merchantPrivateKey = process.env.GEOTAG_MERCHANT_PRIVATE_KEY || '';
if (process.env.GEOTAG_MERCHANT_PRIVATE_KEY_PATH) {
  try {
    const keyPath = path.resolve(process.cwd(), process.env.GEOTAG_MERCHANT_PRIVATE_KEY_PATH);
    if (fs.existsSync(keyPath)) {
      merchantPrivateKey = fs.readFileSync(keyPath, 'utf8');
    }
  } catch (err) {
    console.warn(`[GeoTag Config] Failed to read private key from file: ${err.message}`);
  }
}

// Default fallback to active working credentials if not in .env
const rawPlatformKey = process.env.GEOTAG_PLATFORM_PUBLIC_KEY || `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAh+qW9FEVqQbSpdNOtaltQWQLN9EdF5tPdyOftICy4CSC59+kam8Qv8su9aerTaap2K6092JHtJuMoYJ5fIGRJtr7T2+AOT6SjyBpMsL4DoOkBmbABOvjFV2ngjt4CueK3K7ICkPhVoGFlITrsNhjBmrAbn6ArJgl+pVVv2VXhgUIBYof5qfj9+AoFG8R6Jdc9hrl4dbHXwJL+kHeXgijZGppgqpffRBumMAz3XqwlgMku/p9LF76J1wg6NvejeYKoRxM4dfvr6TzEdj6El9MBu0sQozbcxcrUxGHi2b4kPOXxmK8Pq0kkkG8wcl+vCGSr47fDHFLoiZSYfIBJ3FdJwIDAQAB`;

export const config = {
  port: process.env.PORT || 4000,
  baseUrl: process.env.GEOTAG_BASE_URL || 'https://api.geotag.top',
  businessNo: process.env.GEOTAG_BUSINESS_NO || 'B2177629867239',
  platformPublicKey: formatPemKey(rawPlatformKey, 'PUBLIC KEY'),
  merchantPrivateKey: formatPemKey(merchantPrivateKey, 'PRIVATE KEY'),
};
