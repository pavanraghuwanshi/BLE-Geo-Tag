import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

const keysDir = path.join(__dirname, 'keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

fs.writeFileSync(path.join(keysDir, 'merchant_public.pem'), publicKey);
fs.writeFileSync(path.join(keysDir, 'merchant_private.pem'), privateKey);

console.log('Merchant RSA keys generated successfully in ./keys:');
console.log('Public key: keys/merchant_public.pem');
console.log('Private key: keys/merchant_private.pem');
console.log('\n--- PUBLIC KEY ---');
console.log(publicKey);
