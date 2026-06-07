import type { FastifyPluginAsync } from 'fastify';

export const mapConfigRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/map/config',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  styleUrl:   { type: 'string' },
                  attribution: { type: 'string' },
                  maxZoom:    { type: 'number' },
                  defaultZoom: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        ok: true,
        data: {
          styleUrl:    'https://tiles.openfreemap.org/styles/liberty',
          attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
          maxZoom:     19,
          defaultZoom: 17,
        },
      });
    },
  );
};