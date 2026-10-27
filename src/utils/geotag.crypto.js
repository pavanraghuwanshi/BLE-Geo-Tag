import crypto from 'crypto';

/**
 * Encrypts and signs a request payload according to GeoTag security specification.
 * 
 * Protocol:
 * 1. Generate 16-byte random AES-128 key.
 * 2. Encrypt the payload JSON using AES-128-ECB.
 * 3. Encrypt the AES key with GeoTag Platform Public Key using RSA PKCS#1 padding.
 * 4. Combine as: `${encryptedData},${encryptedAesKey}`.
 * 5. Sign `${data}${timestamp}` with Merchant Private Key using SHA256withRSA.
 */
export function encryptAndSignPayload(payload, { businessNo, platformPublicKey, merchantPrivateKey }) {
  const timestamp = Date.now();
  const rawJson = JSON.stringify(payload);

  // 1. Generate 16-byte random AES key
  const aesKey = crypto.randomBytes(16);

  // 2. Encrypt JSON with AES-128-ECB
  const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
  let encryptedData = cipher.update(rawJson, 'utf8', 'base64');
  encryptedData += cipher.final('base64');

  // 3. Encrypt AES key using Platform Public Key (RSA PKCS#1)
  const encryptedAesKey = crypto.publicEncrypt(
    {
      key: platformPublicKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    aesKey
  ).toString('base64');

  const data = `${encryptedData},${encryptedAesKey}`;

  // 4. Sign data + timestamp using Merchant Private Key
  const signer = crypto.createSign('SHA256');
  signer.update(data + timestamp);
  const sign = signer.sign(merchantPrivateKey, 'base64');

  return {
    businessNo,
    data,
    sign,
    timestamp,
  };
}

/**
 * Decrypts response data returned by GeoTag API.
 * 
 * Protocol:
 * 1. Split `data` by comma into `[encryptedData, encryptedAesKey]`.
 * 2. Decrypt AES key using Merchant Private Key (RSA PKCS#1).
 * 3. Decrypt payload using decrypted AES key (AES-128-ECB).
 */
export function decryptResponseData(dataStr, merchantPrivateKey) {
  if (!dataStr) return null;

  const [encryptedData, encryptedAesKey] = dataStr.split(',');
  if (!encryptedData || !encryptedAesKey) {
    throw new Error('Invalid encrypted response format: missing data or key component');
  }

  // 1. Decrypt AES key with Merchant Private Key
  const aesKey = crypto.privateDecrypt(
    {
      key: merchantPrivateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(encryptedAesKey, 'base64')
  );

  // 2. Decrypt response payload
  const decipher = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
