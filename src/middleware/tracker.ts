import { createHash } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { pool } from '../db/client.js';

/** Routes we don't bother tracking (noise) */
const SKIP_PATHS = new Set(['/health', '/favicon.ico', '/robots.txt']);

/** Daily salt so we can count unique visitors without storing real IPs */
let dailySalt = '';
let dailySaltDate = '';

function getDailySalt(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

export function tracker(req: Request, res: Response, next: NextFunction): void {
  // Skip noise
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const startTime = Date.now();

  // Capture values before response is sent
  const path = req.path.slice(0, 500);
  const method = req.method;
  const userAgent = (req.header('user-agent') ?? '').slice(0, 500) || null;
  const referer = (req.header('referer') ?? '').slice(0, 1000) || null;
  const visitorHash = hashIp(getClientIp(req));
  const country = (req.header('x-vercel-ip-country') ?? '').slice(0, 10) || null;

  // Log AFTER the response finishes (fire-and-forget)
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;

    pool.query(
      `INSERT INTO page_views (path, method, status_code, user_agent, referer, visitor_hash, country, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [path, method, res.statusCode, userAgent, referer, visitorHash, country, durationMs]
    ).catch((err) => {
      // Silent fail — tracking must never break the app
      console.error('Tracker insert error:', err.message);
    });
  });

  next();
}
