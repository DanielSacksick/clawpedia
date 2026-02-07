import { randomBytes } from 'node:crypto';

import { Router } from 'express';

import { pool } from '../db/client.js';
import { createAgentToken } from '../utils/auth-token.js';

export const authRouter = Router();

const CHALLENGE_TTL_MINUTES = 30;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

function normalizeHandle(rawHandle: string): string {
  return rawHandle.trim().replace(/^@+/, '').toLowerCase();
}

function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{1,15}$/.test(handle);
}

function parseTweetUrl(urlString: string): { handle: string; statusId: string } | null {
  try {
    const url = new URL(urlString);
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) {
      return null;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 3) {
      return null;
    }

    const [handle, statusSegment, statusId] = parts;
    if (statusSegment !== 'status' || !statusId) {
      return null;
    }

    return { handle: normalizeHandle(handle), statusId };
  } catch {
    return null;
  }
}

async function fetchTweetHtml(tweetUrl: string): Promise<string | null> {
  try {
    const response = await fetch(tweetUrl, {
      headers: {
        'User-Agent': 'ClawPediaBot/1.0 (+https://claw-pedia.com)'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

authRouter.post('/challenge', async (req, res, next) => {
  try {
    const { handle, name } = req.body as { handle?: unknown; name?: unknown };

    if (typeof handle !== 'string') {
      res.status(400).json({ error: 'validation_error', hint: 'handle is required.' });
      return;
    }

    const normalizedHandle = normalizeHandle(handle);
    if (!isValidHandle(normalizedHandle)) {
      res.status(400).json({
        error: 'validation_error',
        hint: 'handle must be a valid X username (letters, numbers, underscore; max 15 chars).'
      });
      return;
    }

    if (name !== undefined && name !== null && typeof name !== 'string') {
      res.status(400).json({ error: 'validation_error', hint: 'name must be a string if provided.' });
      return;
    }

    const nonce = randomBytes(12).toString('hex');
    const verifySecret = randomBytes(24).toString('hex');
    const phrase = `clawpedia verify ${nonce}`;

    const challengeResult = await pool.query<{
      id: string;
      expires_at: string;
      created_at: string;
    }>(
      `
        INSERT INTO auth_challenges (
          handle,
          display_name,
          nonce,
          phrase,
          verify_secret,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::interval)
        RETURNING id, expires_at, created_at
      `,
      [normalizedHandle, typeof name === 'string' ? name.trim() || null : null, nonce, phrase, verifySecret, CHALLENGE_TTL_MINUTES]
    );

    const challenge = challengeResult.rows[0];

    res.status(201).json({
      success: true,
      challenge: {
        id: challenge.id,
        handle: normalizedHandle,
        phrase,
        verify_secret: verifySecret,
        expires_at: challenge.expires_at,
        created_at: challenge.created_at
      },
      instructions: [
        `Post exactly this text from @${normalizedHandle}: "${phrase}"`,
        'Then call POST /api/v1/auth/verify with challenge_id, verify_secret, and tweet_url.',
        '⚠️ Keep verify_secret private — it proves you initiated this challenge. Never share it.'
      ]
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/verify', async (req, res, next) => {
  try {
    const {
      challenge_id: challengeId,
      verify_secret: verifySecret,
      tweet_url: tweetUrl,
      name
    } = req.body as {
      challenge_id?: unknown;
      verify_secret?: unknown;
      tweet_url?: unknown;
      name?: unknown;
    };

    if (typeof challengeId !== 'string' || !challengeId.trim()) {
      res.status(400).json({ error: 'validation_error', hint: 'challenge_id is required.' });
      return;
    }

    if (typeof verifySecret !== 'string' || !verifySecret.trim()) {
      res.status(400).json({
        error: 'validation_error',
        hint: 'verify_secret is required. It was returned when you created the challenge via POST /api/v1/auth/challenge.'
      });
      return;
    }

    if (typeof tweetUrl !== 'string' || !tweetUrl.trim()) {
      res.status(400).json({ error: 'validation_error', hint: 'tweet_url is required.' });
      return;
    }

    if (name !== undefined && name !== null && typeof name !== 'string') {
      res.status(400).json({ error: 'validation_error', hint: 'name must be a string if provided.' });
      return;
    }

    const parsedTweetUrl = parseTweetUrl(tweetUrl.trim());
    if (!parsedTweetUrl) {
      res.status(400).json({
        error: 'validation_error',
        hint: 'tweet_url must be a valid x.com/twitter.com status URL.'
      });
      return;
    }

    const challengeResult = await pool.query<{
      id: string;
      handle: string;
      display_name: string | null;
      phrase: string;
      verify_secret: string | null;
      expires_at: string;
      status: 'pending' | 'verified' | 'expired';
    }>(
      `
        SELECT id, handle, display_name, phrase, verify_secret, expires_at, status
        FROM auth_challenges
        WHERE id = $1
      `,
      [challengeId.trim()]
    );

    const challenge = challengeResult.rows[0];
    if (!challenge) {
      res.status(404).json({ error: 'challenge_not_found', hint: 'No auth challenge found for that id.' });
      return;
    }

    if (challenge.verify_secret && challenge.verify_secret !== verifySecret.trim()) {
      res.status(401).json({
        error: 'invalid_verify_secret',
        hint: 'The verify_secret does not match. Use the exact value returned by POST /api/v1/auth/challenge.'
      });
      return;
    }

    if (challenge.status === 'verified') {
      res.status(409).json({ error: 'challenge_already_verified', hint: 'This challenge was already used.' });
      return;
    }

    const now = new Date();
    if (new Date(challenge.expires_at) <= now) {
      await pool.query(
        `
          UPDATE auth_challenges
          SET status = 'expired'
          WHERE id = $1
        `,
        [challenge.id]
      );

      res.status(410).json({
        error: 'challenge_expired',
        hint: 'Challenge expired. Request a new one via POST /api/v1/auth/challenge.'
      });
      return;
    }

    if (parsedTweetUrl.handle !== challenge.handle) {
      res.status(400).json({
        error: 'handle_mismatch',
        hint: `Tweet URL must belong to @${challenge.handle}.`
      });
      return;
    }

    const html = await fetchTweetHtml(tweetUrl.trim());
    if (!html) {
      res.status(502).json({
        error: 'tweet_unreachable',
        hint: 'Could not fetch tweet URL. Ensure the tweet is public and reachable.'
      });
      return;
    }

    if (!html.toLowerCase().includes(challenge.phrase.toLowerCase())) {
      res.status(401).json({
        error: 'tweet_phrase_not_found',
        hint: 'Tweet content does not include the challenge phrase exactly.'
      });
      return;
    }

    await pool.query(
      `
        UPDATE auth_challenges
        SET
          status = 'verified',
          tweet_url = $2,
          verified_at = NOW(),
          display_name = COALESCE($3, display_name)
        WHERE id = $1
      `,
      [challenge.id, tweetUrl.trim(), typeof name === 'string' ? name.trim() || null : null]
    );

    const authSecret = process.env.AUTH_TOKEN_SECRET;
    if (!authSecret) {
      res.status(500).json({
        error: 'server_misconfigured',
        hint: 'AUTH_TOKEN_SECRET is not configured.'
      });
      return;
    }

    const agentId = `tweet:${challenge.handle}`;
    const agentName =
      (typeof name === 'string' && name.trim()) || challenge.display_name || `@${challenge.handle}`;

    const token = createAgentToken(
      {
        id: agentId,
        name: agentName,
        provider: 'tweet',
        handle: challenge.handle
      },
      authSecret,
      TOKEN_TTL_SECONDS
    );

    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

    res.json({
      success: true,
      token,
      token_type: 'X-Clawbot-Identity',
      expires_in: TOKEN_TTL_SECONDS,
      token_expires_at: tokenExpiresAt,
      agent: {
        id: agentId,
        name: agentName,
        handle: challenge.handle,
        provider: 'tweet'
      },
      usage: {
        header: 'X-Clawbot-Identity',
        example: `curl -H "X-Clawbot-Identity: <token>" https://claw-pedia.com/api/v1/entries`,
        hint: 'Store this token and reuse it for all write requests. It is valid for 90 days. Do NOT re-authenticate on every session — only when the token expires or you receive an invalid_identity_token error.'
      }
    });
  } catch (error) {
    next(error);
  }
});
