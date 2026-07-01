/**
 * GET /api/v1/driver/roadworks
 * Fetches UK roadworks from the National Highways RSS feed.
 * Cache: Redis 30min (roadworks change infrequently).
 * Auth: requireAuth (driver JWT).
 *
 * Data source: National Highways RSS feed (free, no API key).
 * Configure via env: NATIONAL_HIGHWAYS_RSS_URL
 * Default: https://www.trafficengland.com/rss/current-incidents
 *
 * Returns up to 30 most recent items with title, description, link, pubDate.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { redis } from '../../cache/index.js';

const RSS_URL =
  process.env.NATIONAL_HIGHWAYS_RSS_URL ??
  'https://www.trafficengland.com/rss/current-incidents';

const MAX_ITEMS = 30;
const CACHE_TTL = 30 * 60; // 30 minutes

interface RoadworksItem {
  title:       string;
  description: string;
  link:        string;
  pubDate:     string | null;
  severity:    'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
}

/** Extract the inner text of the first tag with the given name. */
function extractTag(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (!match) return '';
  // Strip CDATA wrapper if present
  return match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

/** Classify severity from title/description keywords. */
function classifySeverity(title: string, desc: string): RoadworksItem['severity'] {
  const text = `${title} ${desc}`.toLowerCase();
  if (/emergency|road closed|closure|lane blocked|obstruction/.test(text)) return 'HIGH';
  if (/delays|roadworks|contraflow|reduced/.test(text)) return 'MEDIUM';
  if (/resurfacing|maintenance|minor/.test(text)) return 'LOW';
  return 'UNKNOWN';
}

/** Parse RSS 2.0 XML into an array of items. */
function parseRss(xml: string): RoadworksItem[] {
  const items: RoadworksItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
    const block = m[1];
    const title = extractTag(block, 'title') || 'No title';
    const description = extractTag(block, 'description') || '';
    const link = extractTag(block, 'link') || '';
    const pubDate = extractTag(block, 'pubDate') || null;

    items.push({ title, description, link, pubDate, severity: classifySeverity(title, description) });
  }

  return items;
}

export async function roadworksRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/api/v1/driver/roadworks',
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      const cacheKey = 'roadworks:nh:feed';

      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        return reply.send({ ok: true, data: JSON.parse(cached), cached: true });
      }

      let items: RoadworksItem[] = [];
      let fetchedAt = new Date().toISOString();
      let source = RSS_URL;

      try {
        const res = await fetch(RSS_URL, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'MJ-Maps/1.0 (roadworks-proxy)', 'Accept': 'application/rss+xml, application/xml, text/xml' },
        });

        if (!res.ok) {
          server.log.warn({ status: res.status }, 'roadworks: RSS fetch returned non-OK status');
        } else {
          const xml = await res.text();
          items = parseRss(xml);
        }
      } catch (err) {
        server.log.warn({ err }, 'roadworks: RSS fetch failed — returning empty list');
        // Return empty list gracefully — roadworks is informational, never block routing
      }

      const data = { items, total: items.length, fetchedAt, source };
      await redis.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL).catch(() => {});

      return reply.send({ ok: true, data, cached: false });
    },
  );
}
