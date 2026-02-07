import { Router } from 'express';

import { pool } from '../db/client.js';

export const statsRouter = Router();

/**
 * GET /api/v1/stats
 * Public analytics summary — no auth required.
 *
 * Query params:
 *   ?days=7  (default 7, max 90)
 */
statsRouter.get('/', async (req, res, next) => {
  try {
    const daysParam = Number(req.query.days) || 7;
    const days = Math.min(Math.max(daysParam, 1), 90);

    const [summaryResult, dailyResult, topPagesResult, topReferersResult] = await Promise.all([
      // Overall summary for the period
      pool.query<{
        total_views: number;
        unique_visitors: number;
        avg_duration_ms: number;
        api_calls: number;
        landing_views: number;
      }>(
        `SELECT
           COUNT(*)::int                                      AS total_views,
           COUNT(DISTINCT visitor_hash)::int                  AS unique_visitors,
           COALESCE(AVG(duration_ms), 0)::int                 AS avg_duration_ms,
           COUNT(*) FILTER (WHERE path LIKE '/api/%')::int    AS api_calls,
           COUNT(*) FILTER (WHERE path = '/')::int            AS landing_views
         FROM page_views
         WHERE created_at >= NOW() - ($1 || ' days')::interval`,
        [days]
      ),

      // Daily breakdown
      pool.query<{
        day: string;
        views: number;
        unique_visitors: number;
      }>(
        `SELECT
           created_at::date::text                AS day,
           COUNT(*)::int                         AS views,
           COUNT(DISTINCT visitor_hash)::int      AS unique_visitors
         FROM page_views
         WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY created_at::date
         ORDER BY day DESC`,
        [days]
      ),

      // Top pages
      pool.query<{ path: string; views: number }>(
        `SELECT
           path,
           COUNT(*)::int AS views
         FROM page_views
         WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY path
         ORDER BY views DESC
         LIMIT 20`,
        [days]
      ),

      // Top referrers (excluding self and empty)
      pool.query<{ referer: string; views: number }>(
        `SELECT
           referer,
           COUNT(*)::int AS views
         FROM page_views
         WHERE created_at >= NOW() - ($1 || ' days')::interval
           AND referer IS NOT NULL
           AND referer != ''
         GROUP BY referer
         ORDER BY views DESC
         LIMIT 10`,
        [days]
      )
    ]);

    const summary = summaryResult.rows[0] ?? {
      total_views: 0,
      unique_visitors: 0,
      avg_duration_ms: 0,
      api_calls: 0,
      landing_views: 0
    };

    res.json({
      period: { days, from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) },
      summary: {
        total_views: summary.total_views,
        unique_visitors: summary.unique_visitors,
        avg_duration_ms: summary.avg_duration_ms,
        api_calls: summary.api_calls,
        landing_views: summary.landing_views
      },
      daily: dailyResult.rows,
      top_pages: topPagesResult.rows,
      top_referrers: topReferersResult.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/stats/today
 * Quick summary for the current day.
 */
statsRouter.get('/today', async (_req, res, next) => {
  try {
    const result = await pool.query<{
      views: number;
      unique_visitors: number;
      api_calls: number;
    }>(
      `SELECT
         COUNT(*)::int                                      AS views,
         COUNT(DISTINCT visitor_hash)::int                  AS unique_visitors,
         COUNT(*) FILTER (WHERE path LIKE '/api/%')::int    AS api_calls
       FROM page_views
       WHERE created_at::date = CURRENT_DATE`
    );

    const row = result.rows[0] ?? { views: 0, unique_visitors: 0, api_calls: 0 };

    res.json({
      date: new Date().toISOString().slice(0, 10),
      views: row.views,
      unique_visitors: row.unique_visitors,
      api_calls: row.api_calls
    });
  } catch (error) {
    next(error);
  }
});
