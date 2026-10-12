import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes, saveRoutes } from './routes/saves';
import { llmRoutes } from './routes/llm';
import type { AppEnv } from './types';

// RPG Loom's production backend (`rpg-loom-api`): Octonion sign-in, cloud saves,
// the journal store, and AI text, on Cloudflare Workers. Mirrors the local
// gateway's HTTP contract so the web client only needs VITE_GATEWAY_URL pointed
// here. The game stays fully playable when this is unreachable.

const app = new Hono<AppEnv>();

const STATIC_ORIGINS = new Set([
  'https://rpg-loom.octonion.io',
  'https://rpg-loom.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      if (!origin) return null;
      if (STATIC_ORIGINS.has(origin)) return origin;
      // Cloudflare Pages preview deploys.
      if (/^https:\/\/[a-z0-9-]+\.rpg-loom\.pages\.dev$/.test(origin)) return origin;
      const extra = String(c.env.ALLOWED_ORIGINS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
      return extra.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  })
);

app.get('/health', (c) => c.json({ ok: true, service: 'rpg-loom-api', environment: c.env.ENVIRONMENT }));

app.route('/api/auth', authRoutes);
app.route('/api/saves', saveRoutes);
app.route('/api/llm', llmRoutes);

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
