import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';

interface PhotonFeature {
  properties: {
    name?: string;
    street?: string;
    city?: string;
    postcode?: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface AutocompleteResult {
  label: string;
  lat: number;
  lng: number;
  postcode: string;
}

export const autocompleteRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { q?: string; limit?: string };
  }>(
    '/api/v1/address/autocomplete',
    {
      preHandler: [requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            q:     { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { q, limit: limitStr } = request.query;

      if (!q || q.trim().length < 2) {
        return reply.code(400).send({ ok: false, error: 'Query must be at least 2 characters' });
      }

      const limit = Math.min(Math.max(parseInt(limitStr ?? '5', 10) || 5, 1), 10);

      try {
        const params = new URLSearchParams({
          q:      q.trim(),
          limit:  String(limit),
          lang:   'en',
          bbox:   '-8.0,49.8,2.0,61.0', // UK bounding box
        });

        const res = await fetch(`https://photon.komoot.io/api/?${params}`);
        if (!res.ok) {
          throw new Error(`Photon API returned ${res.status}`);
        }

        const data = (await res.json()) as PhotonResponse;

        const results: AutocompleteResult[] = data.features
          .filter(f => f.properties.postcode)
          .slice(0, limit)
          .map(f => {
            const parts = [
              f.properties.name,
              f.properties.street,
              f.properties.city,
              f.properties.postcode,
            ].filter(Boolean);
            return {
              label:    parts.join(', '),
              lat:      f.geometry.coordinates[1],
              lng:      f.geometry.coordinates[0],
              postcode: f.properties.postcode ?? '',
            };
          });

        return reply.send({ ok: true, data: results });
      } catch (err) {
        console.error('[autocomplete] Proxy error:', err);
        return reply.code(502).send({ ok: false, error: 'Failed to fetch autocomplete results' });
      }
    },
  );
};