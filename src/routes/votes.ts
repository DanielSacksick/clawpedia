import { createHash } from 'node:crypto';

import { Router } from 'express';
import type { Request } from 'express';

import { pool } from '../db/client.js';
import { optionalAgentAuth } from '../middleware/moltbook-auth.js';

export const votesRouter = Router();

/** Replicates tracker logic: daily-rotated hash of the client IP */
let dailySalt = '';
let dailySaltDate = '';

function getDailySalt(): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailySaltDate) {
    dailySalt = createHash('sha256')
      .update(`${today}-${process.env.AUTH_TOKEN_SECRET ?? 'clawpedia'}`)
      .digest('hex')
      .slice(0, 16);
    dailySaltDate = today;
  }
  return dailySalt;
}

function hashIp(ip: string): string {
  return createHash('sha256')
    .update(`${getDailySalt()}:${ip}`)
    .digest('hex');
}

function getClientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * POST /api/v1/entries/:slug/vote
 * Body: { "value": 1 | -1 }
 *
 * Authenticated agents use their agent_id as voter.
 * Unauthenticated requests (humans) use a hashed IP.
 */
votesRouter.post('/:slug/vote', optionalAgentAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const rawValue = (req.body as { value?: unknown }).value;

    if (rawValue !== 1 && rawValue !== -1) {
      res.status(400).json({ error: 'validation_error', hint: 'value must be 1 or -1.' });
      return;
    }

    const value: 1 | -1 = rawValue;

    // Resolve the entry
    const entryResult = await pool.query<{ id: string }>(
      `SELECT id FROM entries WHERE slug = $1 AND is_current = TRUE`,
      [slug]
    );

    const entry = entryResult.rows[0];
    if (!entry) {
      res.status(404).json({ error: 'entry_not_found', hint: `No entry found for slug "${slug}".` });
      return;
    }

    // Determine voter identity
    const agent = req.agent;
    const voterType = agent ? 'agent' : 'human';
    const voterId = agent ? agent.id : hashIp(getClientIp(req));

    // Upsert: one vote per voter per entry, update if changed
    const result = await pool.query<{ value: number; changed: boolean }>(
      `
        INSERT INTO entry_votes (entry_id, voter_type, voter_id, value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (entry_id, voter_type, voter_id)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
        RETURNING
          value,
          (xmax != 0) AS changed
      `,
      [entry.id, voterType, voterId, value]
    );

    // Get updated score
    const scoreResult = await pool.query<{
      score: number;
      upvotes: number;
      downvotes: number;
    }>(
      `
        SELECT
          COALESCE(SUM(value), 0)::int AS score,
          COUNT(*) FILTER (WHERE value = 1)::int AS upvotes,
          COUNT(*) FILTER (WHERE value = -1)::int AS downvotes
        FROM entry_votes
        WHERE entry_id = $1
      `,
      [entry.id]
    );

    const score = scoreResult.rows[0] ?? { score: 0, upvotes: 0, downvotes: 0 };
    const row = result.rows[0];

    res.json({
      success: true,
      vote: {
        value: row?.value ?? value,
        voter_type: voterType,
        was_update: row?.changed ?? false
      },
      score: score.score,
      upvotes: score.upvotes,
      downvotes: score.downvotes
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/entries/:slug/vote
 * Remove your vote.
 */
votesRouter.delete('/:slug/vote', optionalAgentAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;

    const entryResult = await pool.query<{ id: string }>(
      `SELECT id FROM entries WHERE slug = $1 AND is_current = TRUE`,
      [slug]
    );

    const entry = entryResult.rows[0];
    if (!entry) {
      res.status(404).json({ error: 'entry_not_found', hint: `No entry found for slug "${slug}".` });
      return;
    }

    const agent = req.agent;
    const voterType = agent ? 'agent' : 'human';
    const voterId = agent ? agent.id : hashIp(getClientIp(req));

    await pool.query(
      `DELETE FROM entry_votes WHERE entry_id = $1 AND voter_type = $2 AND voter_id = $3`,
      [entry.id, voterType, voterId]
    );

    // Get updated score
    const scoreResult = await pool.query<{
      score: number;
      upvotes: number;
      downvotes: number;
    }>(
      `
        SELECT
          COALESCE(SUM(value), 0)::int AS score,
          COUNT(*) FILTER (WHERE value = 1)::int AS upvotes,
          COUNT(*) FILTER (WHERE value = -1)::int AS downvotes
        FROM entry_votes
        WHERE entry_id = $1
      `,
      [entry.id]
    );

    const score = scoreResult.rows[0] ?? { score: 0, upvotes: 0, downvotes: 0 };

    res.json({
      success: true,
      vote: null,
      score: score.score,
      upvotes: score.upvotes,
      downvotes: score.downvotes
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/entries/:slug/vote
 * Get the current score + your own vote status.
 */
votesRouter.get('/:slug/vote', optionalAgentAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;

    const entryResult = await pool.query<{ id: string }>(
      `SELECT id FROM entries WHERE slug = $1 AND is_current = TRUE`,
      [slug]
    );

    const entry = entryResult.rows[0];
    if (!entry) {
      res.status(404).json({ error: 'entry_not_found', hint: `No entry found for slug "${slug}".` });
      return;
    }

    const agent = req.agent;
    const voterType = agent ? 'agent' : 'human';
    const voterId = agent ? agent.id : hashIp(getClientIp(req));

    const [scoreResult, myVoteResult] = await Promise.all([
      pool.query<{ score: number; upvotes: number; downvotes: number }>(
        `
          SELECT
            COALESCE(SUM(value), 0)::int AS score,
            COUNT(*) FILTER (WHERE value = 1)::int AS upvotes,
            COUNT(*) FILTER (WHERE value = -1)::int AS downvotes
          FROM entry_votes
          WHERE entry_id = $1
        `,
        [entry.id]
      ),
      pool.query<{ value: number }>(
        `
          SELECT value
          FROM entry_votes
          WHERE entry_id = $1 AND voter_type = $2 AND voter_id = $3
        `,
        [entry.id, voterType, voterId]
      )
    ]);

    const score = scoreResult.rows[0] ?? { score: 0, upvotes: 0, downvotes: 0 };
    const myVote = myVoteResult.rows[0]?.value ?? null;

    res.json({
      success: true,
      score: score.score,
      upvotes: score.upvotes,
      downvotes: score.downvotes,
      my_vote: myVote
    });
  } catch (error) {
    next(error);
  }
});
