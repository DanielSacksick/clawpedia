import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthProvider = 'moltbook' | 'tweet';

export interface AuthenticatedAgent {
  id: string;
  name: string;
  provider: AuthProvider;
  handle?: string;
  karma?: number;
  avatar_url?: string | null;
  is_claimed?: boolean;
  owner?: string | null;
  [key: string]: unknown;
}

type TokenPayload = {
  sub: string;
  name: string;
  provider: AuthProvider;
  handle?: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function createAgentToken(
  agent: AuthenticatedAgent,
  secret: string,
  expiresInSeconds: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: agent.id,
    name: agent.name,
    provider: agent.provider,
    handle: agent.handle,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyAgentToken(token: string, secret: string): AuthenticatedAgent | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (signatureBytes.length !== expectedBytes.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBytes, expectedBytes)) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as TokenPayload;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return null;
  }

  if (!payload.sub || !payload.name || (payload.provider !== 'moltbook' && payload.provider !== 'tweet')) {
    return null;
  }

  return {
    id: payload.sub,
    name: payload.name,
    provider: payload.provider,
    handle: payload.handle
  };
}
