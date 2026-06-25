/**
 * Web Serving Module - Central static file serving for MJ Maps
 *
 * URL structure:
 *   /             -> landing page (pure HTML, no external assets)
 *   /driver       -> Expo web driver app (baseUrl: '/driver' in app.json)
 *   /driver/*     -> driver app assets - serve file first, SPA fallback last
 *   /dispatcher   -> Next.js dispatcher console (basePath: '/dispatcher')
 *   /dispatcher/* -> dispatcher assets - serve file first, SPA fallback last
 *   /api/v1/*     -> API (registered before this module, never reached here)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FastifyReply } from 'fastify';

const LANDING_ROOT    = 'dist/landing';
const DRIVER_ROOT     = 'dist/apps/driver-app/dist';
const DISPATCHER_ROOT = 'dist/dispatcher';

const MIME_TYPES: Record<string, string> = {
  '.html':        'text/html; charset=utf-8',
  '.js':          'application/javascript',
  '.mjs':         'application/javascript',
  '.css':         'text/css',
  '.json':        'application/json',
  '.png':         'image/png',
  '.jpg':         'image/jpeg',
  '.jpeg':        'image/jpeg',
  '.gif':         'image/gif',
  '.svg':         'image/svg+xml',
  '.ico':         'image/x-icon',
  '.woff':        'font/woff',
  '.woff2':       'font/woff2',
  '.ttf':         'font/ttf',
  '.eot':         'application/vnd.ms-fontobject',
  '.map':         'application/json',
  '.txt':         'text/plain',
  '.xml':         'application/xml',
  '.webp':        'image/webp',
  '.webmanifest': 'application/manifest+json',
};

export function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export function resolveSafePath(requestedPath: string, rootDir: string): string | null {
  const normalised = path.normalize(requestedPath).replace(/^(\.\.(\/|\\))+/, '');
  const absolute   = path.resolve(rootDir, normalised);
  if (!absolute.startsWith(path.resolve(rootDir))) return null;
  return absolute;
}

export function fileExists(filePath: string): boolean {
  try { return fs.existsSync(filePath) && fs.statSync(filePath).isFile(); }
  catch { return false; }
}

export function directoryExists(dirPath: string): boolean {
  try { return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(); }
  catch { return false; }
}

function sendFile(reply: FastifyReply, absPath: string, maxAge = 86400): void {
  const content = fs.readFileSync(absPath);
  reply
    .header('Content-Type', getMimeType(absPath))
    .header('Cache-Control', `public, max-age=${maxAge}`)
    .header('X-Content-Type-Options', 'nosniff')
    .header('x-no-compression', '1')
    .code(200)
    .send(content);
}

async function serveSpa(reply: FastifyReply, rootDir: string): Promise<void> {
  const indexPath = path.join(rootDir, 'index.html');
  if (!fileExists(indexPath)) {
    reply.code(503).send('Service Unavailable - build not found');
    return;
  }
  reply
    .header('Content-Type', 'text/html; charset=utf-8')
    .header('Cache-Control', 'public, max-age=60')
    .header('x-no-compression', '1')
    .code(200)
    .send(fs.readFileSync(indexPath));
}

/**
 * Try to serve a static file from rootDir at subPath.
 * Falls back to SPA index.html if the file does not exist (client-side routes).
 */
async function serveFileOrSpa(
  reply: FastifyReply,
  subPath: string,
  rootDir: string,
): Promise<void> {
  if (subPath && subPath !== '/') {
    const safePath = resolveSafePath(subPath.replace(/^\//, ''), rootDir);
    if (safePath && fileExists(safePath)) {
      const maxAge = /\.html$/.test(safePath) ? 60 : 31_536_000;
      sendFile(reply, safePath, maxAge);
      return;
    }
  }
  await serveSpa(reply, rootDir);
}

/** Health check for web layer */
export async function getWebHealth() {
  return {
    landing:    fileExists(path.join(LANDING_ROOT,    'index.html')),
    driver:     fileExists(path.join(DRIVER_ROOT,     'index.html')),
    dispatcher: fileExists(path.join(DISPATCHER_ROOT, 'index.html')),
  };
}

export async function registerWebRoutes(server: any): Promise<void> {
  // Landing page
  server.get('/', async (_req: any, reply: FastifyReply) => {
    await serveSpa(reply, LANDING_ROOT);
  });

  // Root-level static files referenced by landing page HTML
  for (const file of ['favicon.ico', 'favicon.svg', 'robots.txt', 'sitemap.xml', 'apple-touch-icon.png', 'og-image.png']) {
    const captured = file;
    server.get(`/${captured}`, async (_req: any, reply: FastifyReply) => {
      const absPath = path.resolve(LANDING_ROOT, captured);
      if (fileExists(absPath)) {
        sendFile(reply, absPath, captured === 'favicon.ico' ? 604_800 : 86_400);
      } else {
        reply.code(404).send('Not Found');
      }
    });
  }

  // Landing sub-pages
  for (const page of ['/pricing', '/features', '/about', '/contact']) {
    server.get(page, async (_req: any, reply: FastifyReply) => {
      await serveSpa(reply, LANDING_ROOT);
    });
  }

  // Driver app - served at /driver
  // app.json sets experiments.baseUrl: '/driver' so all Expo asset URLs are
  // prefixed with /driver/ (e.g. /driver/_expo/static/js/web/entry-xxx.js).
  server.get('/driver', async (_req: any, reply: FastifyReply) => {
    await serveSpa(reply, DRIVER_ROOT);
  });

  server.get('/driver/*', async (request: any, reply: FastifyReply) => {
    const subPath = request.url.replace(/^\/driver/, '') || '/';
    const filePath = subPath.split('?')[0];
    await serveFileOrSpa(reply, filePath, DRIVER_ROOT);
  });

  // Dispatcher console - served at /dispatcher
  // next.config.js sets basePath: '/dispatcher' so all Next.js asset URLs are
  // prefixed with /dispatcher/ (e.g. /dispatcher/_next/static/chunks/xxx.js).
  server.get('/dispatcher', async (_req: any, reply: FastifyReply) => {
    await serveSpa(reply, DISPATCHER_ROOT);
  });

  server.get('/dispatcher/*', async (request: any, reply: FastifyReply) => {
    const subPath = request.url.replace(/^\/dispatcher/, '') || '/';
    const filePath = subPath.split('?')[0];
    await serveFileOrSpa(reply, filePath, DISPATCHER_ROOT);
  });

  server.get('/enterprise', async (_req: any, reply: FastifyReply) => {
    reply.redirect('/dispatcher');
  });

  // Web health check
  server.get('/web-health', async (_req: any, reply: FastifyReply) => {
    const health = await getWebHealth();
    reply.code(health.landing && health.driver && health.dispatcher ? 200 : 503).send(health);
  });
}
