// MUST set JWT_SECRET BEFORE loading anything that reads it at module evaluation time.
process.env.JWT_SECRET = 'test-secret-for-jwt';
process.env.NODE_ENV = 'test';

const { sign } = require('jsonwebtoken');
const Fastify = require('fastify');
const { analyticsRoutes } = require('../../../../dist/services/api/routes/analytics');

async function main() {
  console.log('[1] JWT_SECRET:', process.env.JWT_SECRET);
  const srv = Fastify({ logger: false });
  console.log('[2] Fastify created');
  await srv.register(analyticsRoutes);
  console.log('[3] analyticsRoutes registered');
  await srv.ready();
  console.log('[4] server ready');

  const token = sign(
    { sub: 'user-dispatcher-no-enterprise', role: 'dispatcher', tier: 'standard', planId: 'navigation' },
    'test-secret-for-jwt'
  );
  console.log('[5] token created');

  // Test with NO token first (expect 401 fast)
  console.log('[6a] Testing NO auth (expect 401 fast)...');
  let res = await srv.inject({ method: 'GET', url: '/api/v1/dispatcher/analytics/routes' });
  console.log('  No-auth Status:', res.statusCode, '(expected 401)');

  // Test with invalid token
  console.log('[6b] Testing INVALID token (expect 401 fast)...');
  res = await srv.inject({ method: 'GET', url: '/api/v1/dispatcher/analytics/routes', headers: { Authorization: 'Bearer invalid' } });
  console.log('  Invalid-token Status:', res.statusCode, '(expected 401)');

  // Test with VALID token but no enterprise (may hang if pool.query() is called)
  console.log('[6c] Testing VALID token but no enterprise...');
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('inject timeout')), 3000));
  const request = srv.inject({
    method: 'GET', url: '/api/v1/dispatcher/analytics/routes',
    headers: { Authorization: 'Bearer ' + token }
  });
  try {
    res = await Promise.race([request, timeout]);
    console.log('  Got response:', res.statusCode);
    console.log('  Body:', res.body.substring(0, 200));
  } catch (e) {
    console.log('  HANG: inject() never returned with valid auth token');
  }

  await srv.close();
  console.log('[7] done');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });