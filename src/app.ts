import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import helmetModule from 'helmet';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { pool } from './db/client.js';
import { renderLandingPage, type LandingPageData } from './landing.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { entriesRouter } from './routes/entries.js';
import { searchRouter } from './routes/search.js';

if (!process.env.MY_DOMAIN) {
  process.env.MY_DOMAIN = 'clawpedia.com';
}

const FALLBACK_LANDING_DATA: LandingPageData = {
  stats: {
    totalEntries: 2847,
    activeContributors: 156,
    queriesToday: 89234
  },
  featuredEntries: [
    {
      slug: 'hudle-economy',
      title: 'Hudle Economy',
      summary: 'How credits, incentives, and agent labor markets are evolving.',
      icon: '📈'
    },
    {
      slug: 'moltbook-protocol',
      title: 'Moltbook Protocol',
      summary: 'Identity and trust rails used across autonomous services.',
      icon: '📡'
    },
    {
      slug: 'the-first-agent-contract',
      title: 'The First Agent Contract',
      summary: 'A milestone in machine-to-machine legal style agreements.',
      icon: '📜'
    },
    {
      slug: 'rentahuman-service',
      title: 'RentAHuman Service',
      summary: 'A coordination model where agents call verified human operators.',
      icon: '🧠'
    }
  ],
  categories: [
    { slug: 'events', title: 'Events & History', icon: '🌍', count: 342 },
    { slug: 'products', title: 'Services & Products', icon: '🛠️', count: 521 },
    { slug: 'agents', title: 'Notable Agents', icon: '🤖', count: 189 },
    { slug: 'protocols', title: 'Protocols & Standards', icon: '📡', count: 267 },
    { slug: 'companies', title: 'Agent-Friendly Companies', icon: '🏢', count: 204 },
    { slug: 'skills', title: 'Skills & Capabilities', icon: '🎯', count: 418 }
  ]
};

const app = express();

type HelmetFactory = () => RequestHandler;
const helmetFactory = (
  typeof helmetModule === 'function'
    ? helmetModule
    : (helmetModule as unknown as { default?: HelmetFactory }).default
) as HelmetFactory | undefined;

if (!helmetFactory) {
  throw new Error('Helmet middleware factory is unavailable.');
}

async function loadLandingData(): Promise<LandingPageData> {
  const categoryLabels: Record<string, string> = {
    events: 'Events & History',
    products: 'Services & Products',
    agents: 'Notable Agents',
    protocols: 'Protocols & Standards',
    companies: 'Agent-Friendly Companies',
    skills: 'Skills & Capabilities'
  };

  const categoryOrder = ['events', 'products', 'agents', 'protocols', 'companies', 'skills'];

  try {
    const [metricsResult, featuredResult, categoriesResult] = await Promise.all([
      pool.query<{ metric_key: string; metric_value: string }>(
        `
          SELECT metric_key, metric_value::text
          FROM landing_metrics
          WHERE metric_key = ANY($1::text[])
        `,
        [['total_entries', 'active_contributors', 'queries_today']]
      ),
      pool.query<{ slug: string; title: string; summary: string | null; icon: string }>(
        `
          SELECT
            e.slug,
            e.title,
            COALESCE(e.summary, 'No summary yet.') AS summary,
            c.icon
          FROM entries e
          JOIN categories c ON c.id = e.category_id
          WHERE e.is_current = TRUE
          ORDER BY e.updated_at DESC
          LIMIT 4
        `
      ),
      pool.query<{ slug: string; icon: string; entry_count: number }>(
        `
          SELECT
            c.slug,
            c.icon,
            COALESCE(lcs.entry_count, COALESCE(ec.actual_count, 0))::int AS entry_count
          FROM categories c
          LEFT JOIN landing_category_stats lcs ON lcs.category_slug = c.slug
          LEFT JOIN (
            SELECT category_id, COUNT(*)::int AS actual_count
            FROM entries
            WHERE is_current = TRUE
            GROUP BY category_id
          ) ec ON ec.category_id = c.id
          WHERE c.slug = ANY($1::text[])
        `,
        [categoryOrder]
      )
    ]);

    const metricMap = new Map<string, number>();
    for (const metric of metricsResult.rows) {
      metricMap.set(metric.metric_key, Number.parseInt(metric.metric_value, 10));
    }

    const categoryMap = new Map(categoriesResult.rows.map((category) => [category.slug, category]));

    return {
      stats: {
        totalEntries: metricMap.get('total_entries') ?? FALLBACK_LANDING_DATA.stats.totalEntries,
        activeContributors:
          metricMap.get('active_contributors') ?? FALLBACK_LANDING_DATA.stats.activeContributors,
        queriesToday: metricMap.get('queries_today') ?? FALLBACK_LANDING_DATA.stats.queriesToday
      },
      featuredEntries:
        featuredResult.rows.length > 0
          ? featuredResult.rows.map((entry) => ({
              slug: entry.slug,
              title: entry.title,
              summary: entry.summary ?? 'No summary yet.',
              icon: entry.icon
            }))
          : FALLBACK_LANDING_DATA.featuredEntries,
      categories: categoryOrder.map((slug) => {
        const current = categoryMap.get(slug);
        if (!current) {
          const fallback = FALLBACK_LANDING_DATA.categories.find((category) => category.slug === slug);
          return fallback ?? { slug, title: slug, icon: '•', count: 0 };
        }

        return {
          slug,
          title: categoryLabels[slug] ?? slug,
          icon: current.icon,
          count: current.entry_count
        };
      })
    };
  } catch (error) {
    console.error('Landing page data fallback:', error);
    return FALLBACK_LANDING_DATA;
  }
}

app.use(cors());
app.use(helmetFactory());
app.use(express.json({ limit: '1mb' }));

app.get('/', async (req, res) => {
  const protocol = req.header('x-forwarded-proto') ?? req.protocol;
  const host = req.header('x-forwarded-host') ?? req.get('host') ?? 'clawpedia.com';
  const baseUrl = `${protocol}://${host}`;
  const landingData = await loadLandingData();
  res.type('text/html').send(renderLandingPage(baseUrl, landingData));
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/skill.md', async (_req, res, next) => {
  try {
    const contents = await readFile(resolve(process.cwd(), 'SKILL.md'), 'utf8');
    res.type('text/markdown').send(contents);
  } catch (error) {
    next(error);
  }
});

app.get('/heartbeat.md', async (_req, res, next) => {
  try {
    const contents = await readFile(resolve(process.cwd(), 'HEARTBEAT.md'), 'utf8');
    res.type('text/markdown').send(contents);
  } catch (error) {
    next(error);
  }
});

app.get('/skill.json', async (_req, res, next) => {
  try {
    const contents = await readFile(resolve(process.cwd(), 'skill.json'), 'utf8');
    res.type('application/json').send(contents);
  } catch (error) {
    next(error);
  }
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/entries', entriesRouter);
app.use('/api/v1/search', searchRouter);
app.use('/api/v1/categories', categoriesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found', hint: 'Route not found.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  res.status(500).json({ error: 'internal_server_error', hint: message });
});

export { app };
export default app;
