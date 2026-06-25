/**
 * POST /api/v1/stops/:stopId/difficulty
 * GET  /api/v1/stops/:stopId/difficulty-consensus
 *
 * Difficulty reporting: driver taps categories after a delivery.
 * Once 2+ independent drivers report the same category at the same address,
 * it shows in ApproachBrief for future drivers as community consensus.
 *
 * Categories are matched to canonical consensus text when displayed.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';

// Canonical category list — IDs are stored in DB; labels/consensus text live here.
// Any category not in this list is rejected.
export const DIFFICULTY_CATEGORIES = [
  {
    id: 'NO_PARKING',
    emoji: '🅿️',
    label: 'Nowhere to park',
    consensus: 'No parking at property — park on nearby road',
  },
  {
    id: 'LONG_WALK',
    emoji: '🚶',
    label: 'Long walk from parking',
    consensus: 'Long walk from nearest parking to the door',
  },
  {
    id: 'STAIRS_ONLY',
    emoji: '🏗️',
    label: 'Stairs only — no lift',
    consensus: 'Stairs only — no lift access. Prepare for heavy items.',
  },
  {
    id: 'HARD_TO_FIND',
    emoji: '🔍',
    label: 'Hard to find',
    consensus: 'Property can be tricky to locate — check numbers carefully',
  },
  {
    id: 'GATE_CODE',
    emoji: '🔑',
    label: 'Gate or code needed',
    consensus: 'Gate or door code required — confirm with recipient in advance',
  },
  {
    id: 'DOG',
    emoji: '🐕',
    label: 'Dog at property',
    consensus: 'Dog at property — ring bell and wait; approach with care',
  },
  {
    id: 'INTERCOM',
    emoji: '🔔',
    label: 'Intercom / buzzer',
    consensus: 'Use intercom to gain access — allow extra time',
  },
  {
    id: 'BACK_ENTRANCE',
    emoji: '🚪',
    label: 'Use back / side door',
    consensus: 'Use the back or side entrance — front door not in use',
  },
  {
    id: 'NARROW_ROAD',
    emoji: '⬜',
    label: 'Very narrow road',
    consensus: 'Very narrow road — consider parking before the property and walking',
  },
  {
    id: 'SLOW_RESPONSE',
    emoji: '⏱️',
    label: 'Slow to answer',
    consensus: 'Allow extra time at door — customer may be slow to respond',
  },
] as const;

type CategoryId = (typeof DIFFICULTY_CATEGORIES)[number]['id'];
const VALID_CATEGORY_IDS = DIFFICULTY_CATEGORIES.map(c => c.id) as [CategoryId, ...CategoryId[]];

const categoryMap = Object.fromEntries(DIFFICULTY_CATEGORIES.map(c => [c.id, c]));

// Normalise address to a stable hash key (lowercase, strip punctuation, collapse spaces)
function normaliseAddress(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Build consensus text from top categories (max 3 shown)
export function buildConsensusNote(categories: string[]): string {
  return categories
    .slice(0, 3)
    .map(id => categoryMap[id]?.consensus ?? id)
    .join(' · ');
}

const ReportBodySchema = z.object({
  categories: z.array(z.enum(VALID_CATEGORY_IDS)).min(1).max(VALID_CATEGORY_IDS.length),
  note: z.string().max(120).optional(),
  address: z.string().max(500),  // sent from client so we can normalise
});

export const deliveryDifficultyRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/v1/stops/:stopId/difficulty
   * Driver submits a difficulty report for a stop.
   */
  fastify.post<{
    Params: { stopId: string };
    Body: z.infer<typeof ReportBodySchema>;
  }>(
    '/api/v1/stops/:stopId/difficulty',
    {
      preHandler: [requireAuth],
      schema: {
        params: { type: 'object', properties: { stopId: { type: 'string' } }, required: ['stopId'] },
        body: {
          type: 'object',
          properties: {
            categories: { type: 'array', items: { type: 'string' } },
            note:       { type: 'string' },
            address:    { type: 'string' },
          },
          required: ['categories', 'address'],
        },
      },
    },
    async (request, reply) => {
      const parsed = ReportBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });

      const { stopId } = request.params;
      const { categories, note, address } = parsed.data;
      const driverId = (request as any).user?.id ?? null;
      const addressHash = normaliseAddress(address);

      await pool.query(
        `INSERT INTO delivery_difficulty_reports
           (stop_id, address_hash, driver_id, categories, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [stopId, addressHash, driverId, categories, note ?? null],
      );

      // After insert, check if we now have consensus (≥2 drivers, same category)
      // If so, push the synthesised note back to all stops at this address hash.
      await updateConsensusForAddress(addressHash).catch(() => {/* non-fatal */});

      return reply.send({ ok: true });
    },
  );

  /**
   * GET /api/v1/stops/:stopId/difficulty-consensus
   * Returns community consensus for a stop's address (for ApproachBrief upgrade).
   */
  fastify.get<{ Params: { stopId: string } }>(
    '/api/v1/stops/:stopId/difficulty-consensus',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { stopId } = request.params;

      // Get address hash from stop
      const { rows: stopRows } = await pool.query<{ address: string }>(
        `SELECT address FROM stops WHERE id = $1 LIMIT 1`,
        [stopId],
      );
      if (!stopRows[0]) return reply.code(404).send({ ok: false, error: 'Stop not found' });

      const addressHash = normaliseAddress(stopRows[0].address);

      const { rows } = await pool.query<{ category: string; driver_count: number; report_count: number }>(
        `SELECT category, driver_count, report_count
         FROM delivery_difficulty_consensus
         WHERE address_hash = $1
         ORDER BY driver_count DESC, report_count DESC`,
        [addressHash],
      );

      const topCategories = rows.slice(0, 5).map(r => ({
        id: r.category,
        ...( categoryMap[r.category] ?? { emoji: '⚠️', label: r.category, consensus: r.category }),
        driverCount: r.driver_count,
        reportCount: r.report_count,
      }));

      const hasConsensus = topCategories.some(c => c.driverCount >= 2);
      const consensusNote = hasConsensus
        ? buildConsensusNote(topCategories.filter(c => c.driverCount >= 2).map(c => c.id))
        : null;

      return reply.send({
        ok: true,
        data: {
          addressHash,
          topCategories,
          hasConsensus,
          consensusNote,
        },
      });
    },
  );
};

/**
 * After each new report, re-synthesise access_notes for all stops
 * at this address hash that have ≥2-driver consensus on any category.
 */
async function updateConsensusForAddress(addressHash: string): Promise<void> {
  const { rows } = await pool.query<{ category: string; driver_count: number }>(
    `SELECT category, driver_count
     FROM delivery_difficulty_consensus
     WHERE address_hash = $1
     ORDER BY driver_count DESC, report_count DESC
     LIMIT 5`,
    [addressHash],
  );

  if (rows.length === 0) return;

  const consensusCategories = rows.filter(r => r.driver_count >= 2).map(r => r.category);
  if (consensusCategories.length === 0) return;

  const note = buildConsensusNote(consensusCategories);

  // Push synthesised note to all stops at this address hash
  await pool.query(
    `UPDATE stops
     SET access_notes = $1, updated_at = NOW()
     WHERE LOWER(REGEXP_REPLACE(address, '[^a-zA-Z0-9 ]', '', 'g')) = $2
       AND access_notes IS DISTINCT FROM $1`,
    [note, addressHash],
  );
}
