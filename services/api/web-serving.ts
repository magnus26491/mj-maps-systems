/**
 * Web Serving Module — Central static file serving for MJ Maps
 * 
 * Single source of truth for all frontend serving.
 * Prevents directory traversal and serves only allowed directories.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FastifyReply } from 'fastify';

// Allowed root directories (relative to project root)
const ALLOWED_ROOTS = [
  'dist/landing',
  'dist/apps/driver-app/dist',
  'dist/dispatcher',
];

// MIME types
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

/**
 * Resolve a safe path preventing directory traversal
 */
export function resolveSafePath(
  requestedPath: string,
  rootDir: string
): string | null {
  // Normalize the path
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\))+/, '');
  
  // Resolve to absolute path
  const absolutePath = path.resolve(rootDir, normalizedPath);
  
  // Ensure the resolved path is within the root directory
  if (!absolutePath.startsWith(path.resolve(rootDir))) {
    return null; // Directory traversal detected
  }
  
  return absolutePath;
}

/**
 * Get MIME type for a file
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export function directoryExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read file contents safely
 */
export function readFileSafe(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Serve a file safely using Fastify reply
 */
export async function safeServeFile(
  reply: FastifyReply,
  filePath: string,
  rootDir: string
): Promise<void> {
  const safePath = resolveSafePath(filePath, rootDir);
  
  if (!safePath) {
    reply.code(403).send('Forbidden');
    return;
  }
  
  if (!fileExists(safePath)) {
    reply.code(404).send('Not Found');
    return;
  }
  
  const content = readFileSafe(safePath);
  if (!content) {
    reply.code(500).send('Internal Server Error');
    return;
  }
  
  const mimeType = getMimeType(safePath);
  
  reply
    .header('Content-Type', mimeType)
    .header('Cache-Control', 'public, max-age=86400')
    .header('X-Content-Type-Options', 'nosniff')
    .code(200)
    .send(content);
}

/**
 * Serve an HTML file for SPA fallback
 */
export async function safeServeSpa(
  reply: FastifyReply,
  rootDir: string
): Promise<void> {
  const indexPath = path.join(rootDir, 'index.html');
  
  if (!fileExists(indexPath)) {
    reply.code(503).send('Service Unavailable - Build not found');
    return;
  }
  
  const content = readFileSafe(indexPath);
  if (!content) {
    reply.code(500).send('Internal Server Error');
    return;
  }
  
  reply
    .header('Content-Type', 'text/html; charset=utf-8')
    .header('Cache-Control', 'public, max-age=60')
    .code(200)
    .send(content);
}

/**
 * Get web health status for all frontends
 */
export async function getWebHealth(): Promise<{
  landing: boolean;
  driver: boolean;
  dispatcher: boolean;
}> {
  return {
    landing: fileExists('dist/landing/index.html'),
    driver: fileExists('dist/apps/driver-app/dist/index.html'),
    dispatcher: fileExists('dist/dispatcher/index.html'),
  };
}

/**
 * Register web serving routes on a Fastify instance
 */
export async function registerWebRoutes(server: any): Promise<void> {
  const LANDING_ROOT = 'dist/landing';
  const DRIVER_ROOT = 'dist/apps/driver-app/dist';
  const DISPATCHER_ROOT = 'dist/dispatcher';
  
  // Helper: serve an Astro static page (directory routing: /foo → /foo/index.html)
  async function serveAstroPage(reply: FastifyReply, subPath: string): Promise<void> {
    if (!directoryExists(LANDING_ROOT)) {
      reply.code(503).send('Landing page not built');
      return;
    }
    // Try exact file
    if (subPath && subPath !== '/') {
      const clean = subPath.replace(/^\//, '');
      const exact = resolveSafePath(clean, LANDING_ROOT);
      if (exact && fileExists(exact)) {
        const maxAge = /\.html$/.test(exact) ? 60 : 31_536_000;
        await safeServeFile(reply, clean, LANDING_ROOT);
        return;
      }
      // Astro directory routing: /pricing → /pricing/index.html
      const dirIdx = resolveSafePath(`${clean}/index.html`, LANDING_ROOT);
      if (dirIdx && fileExists(dirIdx)) {
        const content = fs.readFileSync(dirIdx);
        reply.header('Content-Type', 'text/html; charset=utf-8')
             .header('Cache-Control', 'public, max-age=60')
             .header('X-Content-Type-Options', 'nosniff')
             .code(200).send(content);
        return;
      }
    }
    await safeServeSpa(reply, LANDING_ROOT);
  }

  // Landing page - root
  server.get('/', async (_request: any, reply: FastifyReply) => {
    await serveAstroPage(reply, '/');
  });

  // Landing static assets (Astro emits content-hashed files to _assets/)
  server.get('/_assets/*', async (request: any, reply: FastifyReply) => {
    const subPath = request.url.split('?')[0].replace(/^\/_assets\//, '');
    const filePath = `_assets/${subPath}`;
    const safePath = resolveSafePath(filePath, LANDING_ROOT);
    if (!safePath || !fileExists(safePath)) {
      reply.code(404).send('Not Found');
      return;
    }
    const content = readFileSafe(safePath);
    if (!content) { reply.code(500).send('Internal Server Error'); return; }
    reply
      .header('Content-Type', getMimeType(safePath))
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .code(200).send(content);
  });

  // Root-level static files (favicon, robots, sitemap, OG image)
  for (const file of ['favicon.svg', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'sitemap-index.xml', 'apple-touch-icon.png', 'og-image.png']) {
    const f = file;
    server.get(`/${f}`, async (_request: any, reply: FastifyReply) => {
      await safeServeFile(reply, f, LANDING_ROOT);
    });
  }

  // Landing sub-pages (Astro directory routing)
  for (const page of ['/pricing', '/features', '/drivers', '/fleet', '/about', '/contact', '/register', '/login']) {
    const p = page;
    server.get(p, async (_request: any, reply: FastifyReply) => {
      await serveAstroPage(reply, p);
    });
  }

  // Legal sub-pages
  server.get('/legal/privacy', async (_request: any, reply: FastifyReply) => {
    await serveAstroPage(reply, '/legal/privacy');
  });
  server.get('/legal/terms', async (_request: any, reply: FastifyReply) => {
    await serveAstroPage(reply, '/legal/terms');
  });
  server.get('/legal/cookies', async (_request: any, reply: FastifyReply) => {
    await serveAstroPage(reply, '/legal/cookies');
  });

  // Driver app
  server.get('/driver', async (_request: any, reply: FastifyReply) => {
    if (directoryExists(DRIVER_ROOT)) {
      await safeServeSpa(reply, DRIVER_ROOT);
    } else {
      reply.code(503).send('Driver app not built');
    }
  });
  
  // Driver app SPA fallback — * catches all /driver/* sub-paths for React Router
  server.get('/driver/*', async (_request: any, reply: FastifyReply) => {
    await safeServeSpa(reply, DRIVER_ROOT);
  });
  
  // Dispatcher dashboard
  server.get('/dispatcher', async (_request: any, reply: FastifyReply) => {
    if (directoryExists(DISPATCHER_ROOT)) {
      await safeServeSpa(reply, DISPATCHER_ROOT);
    } else {
      reply.code(503).send('Dispatcher not built');
    }
  });
  
  // Dispatcher SPA fallback — * catches all /dispatcher/* sub-paths for React Router
  server.get('/dispatcher/*', async (_request: any, reply: FastifyReply) => {
    await safeServeSpa(reply, DISPATCHER_ROOT);
  });
  
  // Enterprise alias
  server.get('/enterprise', async (_request: any, reply: FastifyReply) => {
    reply.redirect('/dispatcher');
  });
  
  // Web health check
  server.get('/web-health', async (_request: any, reply: FastifyReply) => {
    const health = await getWebHealth();
    const allHealthy = health.landing && health.driver && health.dispatcher;
    reply.code(allHealthy ? 200 : 503).send(health);
  });
}
