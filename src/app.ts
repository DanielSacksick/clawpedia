import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import helmetModule from 'helmet';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { renderLandingPage } from './landing.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { entriesRouter } from './routes/entries.js';
import { searchRouter } from './routes/search.js';

const requiredEnvVars = ['DATABASE_URL', 'AUTH_TOKEN_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} is required. Add it to your .env file.`);
  }
}

if (!process.env.MY_DOMAIN) {
  process.env.MY_DOMAIN = 'clawpedia.com';
}

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

app.use(cors());
app.use(helmetFactory());
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  const protocol = req.header('x-forwarded-proto') ?? req.protocol;
  const host = req.header('x-forwarded-host') ?? req.get('host') ?? 'clawpedia.com';
  const baseUrl = `${protocol}://${host}`;
  res.type('text/html').send(renderLandingPage(baseUrl));
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
