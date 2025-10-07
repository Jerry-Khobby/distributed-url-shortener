import * as crypto from 'crypto';

export function encrypt(data: any): string {
  const password = process.env.ENCRYPTION_KEY;
  if (!password) {
    throw new Error('Missing ENCRYPTION_KEY environment variable');
  }

  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encryptedText = Buffer.concat([cipher.update(String(data), 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encryptedText.toString('hex');
}

export function decrypt(data: string): string {
  const password = process.env.ENCRYPTION_KEY;
  if (!password) {
    throw new Error('Missing ENCRYPTION_KEY environment variable');
  }

  const key = crypto.scryptSync(password, 'salt', 32);
  const [ivHex, encryptedHex] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decryptedText = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decryptedText.toString('utf8');
}
