import { Router } from 'express';

import { pool } from '../db/client.js';

export const searchRouter = Router();

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

searchRouter.get('/', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      res.status(400).json({
        error: 'validation_error',
        hint: 'Provide a non-empty q query parameter, for example /api/v1/search?q=moltbook.'
      });
      return;
    }

    const category = typeof req.query.category === 'string' ? req.query.category.trim() : null;
    const limit = Math.min(toPositiveInteger(req.query.limit, 20), 50);

    const results = await pool.query(
      `
        SELECT
          e.id,
          e.slug,
          e.title,
          e.summary,
          e.updated_at,
          c.slug AS category_slug,
          c.name AS category_name,
          c.icon AS category_icon,
          ts_rank(e.search_vector, plainto_tsquery('english', $1)) AS rank
        FROM entries e
        JOIN categories c ON c.id = e.category_id
        WHERE e.is_current = TRUE
          AND e.search_vector @@ plainto_tsquery('english', $1)
          AND ($2::text IS NULL OR c.slug = $2)
        ORDER BY rank DESC, e.updated_at DESC
        LIMIT $3
      `,
      [query, category || null, limit]
    );

    res.json({
      success: true,
      query,
      results: results.rows,
      count: results.rows.length
    });
  } catch (error) {
    next(error);
  }
});
