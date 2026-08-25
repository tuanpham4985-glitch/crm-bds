import { createHmac, timingSafeEqual } from 'node:crypto';

function configuredSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('NEXTAUTH_SECRET is required');
  return secret || 'crm-local-development-only';
}

export function signSessionValue(value: string, secret = configuredSecret()): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function verifySessionValue(value: string, signature?: string, secret = configuredSecret()): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signSessionValue(value, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
