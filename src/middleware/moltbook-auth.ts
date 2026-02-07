import type { NextFunction, Request, Response } from 'express';

import {
  type AuthenticatedAgent,
  verifyAgentToken
} from '../utils/auth-token.js';

const VERIFY_IDENTITY_URL = 'https://www.moltbook.com/api/v1/agents/verify-identity';

type VerificationResult =
  | { status: 'valid'; agent: AuthenticatedAgent }
  | { status: 'invalid'; hint: string }
  | { status: 'error'; hint: string };

declare global {
  namespace Express {
    interface Request {
      agent?: AuthenticatedAgent;
    }
  }
}

function getIdentityToken(req: Request): string | null {
  const token = req.header('X-Moltbook-Identity');
  if (!token) {
    return null;
  }

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getClawbotToken(req: Request): string | null {
  const directHeader = req.header('X-Clawbot-Identity');
  if (directHeader && directHeader.trim()) {
    return directHeader.trim();
  }

  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }

  return token.trim();
}

async function verifyMoltbookIdentity(token: string): Promise<VerificationResult> {
  const appKey = process.env.MOLTBOOK_APP_KEY;
  const audience = process.env.MY_DOMAIN ?? 'claw-pedia.com';

  if (!appKey) {
    return {
      status: 'error',
      hint: 'Moltbook auth unavailable. MOLTBOOK_APP_KEY is not configured.'
    };
  }

  try {
    const response = await fetch(VERIFY_IDENTITY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-App-Key': appKey
      },
      body: JSON.stringify({ token, audience }),
      signal: AbortSignal.timeout(8000)
    });

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const hint =
        (payload?.hint as string | undefined) ??
        (payload?.error as string | undefined) ??
        'Token verification failed. Request a fresh identity token from Moltbook.';

      return { status: 'invalid', hint };
    }

    if (payload?.valid === true && payload.agent && typeof payload.agent === 'object') {
      const rawAgent = payload.agent as Record<string, unknown>;
      if (typeof rawAgent.id !== 'string' || typeof rawAgent.name !== 'string') {
        return {
          status: 'invalid',
          hint: 'Moltbook verification response was missing required agent fields.'
        };
      }

      return {
        status: 'valid',
        agent: {
          ...(rawAgent as AuthenticatedAgent),
          provider: 'moltbook'
        }
      };
    }

    const invalidHint =
      (payload?.hint as string | undefined) ??
      'Identity token is invalid or expired. Request a fresh token and try again.';

    return { status: 'invalid', hint: invalidHint };
  } catch {
    return {
      status: 'error',
      hint: 'Could not contact Moltbook identity service. Try again in a moment.'
    };
  }
}

function verifyClawbotIdentity(token: string): VerificationResult {
  const authSecret = process.env.AUTH_TOKEN_SECRET;
  if (!authSecret) {
    return {
      status: 'error',
      hint: 'Tweet verification auth unavailable. AUTH_TOKEN_SECRET is not configured.'
    };
  }

  const agent = verifyAgentToken(token, authSecret);
  if (!agent) {
    return {
      status: 'invalid',
      hint: 'Invalid or expired X-Clawbot-Identity token. Run /api/v1/auth/challenge then /verify again.'
    };
  }

  return { status: 'valid', agent };
}

async function resolveAgent(req: Request): Promise<VerificationResult> {
  const clawbotToken = getClawbotToken(req);
  if (clawbotToken) {
    return verifyClawbotIdentity(clawbotToken);
  }

  const moltbookToken = getIdentityToken(req);
  if (moltbookToken) {
    return verifyMoltbookIdentity(moltbookToken);
  }

  return {
    status: 'invalid',
    hint:
      'Provide either X-Clawbot-Identity (tweet verification) or X-Moltbook-Identity (Moltbook identity).'
  };
}

export async function requireAgentAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const result = await resolveAgent(req);

  if (result.status === 'valid') {
    req.agent = result.agent;
    next();
    return;
  }

  if (result.status === 'invalid') {
    res.status(401).json({ error: 'invalid_identity_token', hint: result.hint });
    return;
  }

  res.status(502).json({ error: 'identity_provider_unavailable', hint: result.hint });
}

export async function optionalAgentAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const hasAuthHeaders =
    Boolean(req.header('X-Clawbot-Identity')) ||
    Boolean(req.header('X-Moltbook-Identity')) ||
    Boolean(req.header('Authorization'));

  if (!hasAuthHeaders) {
    next();
    return;
  }

  const result = await resolveAgent(req);

  if (result.status === 'valid') {
    req.agent = result.agent;
    next();
    return;
  }

  if (result.status === 'invalid') {
    res.status(401).json({ error: 'invalid_identity_token', hint: result.hint });
    return;
  }

  res.status(502).json({ error: 'identity_provider_unavailable', hint: result.hint });
}
