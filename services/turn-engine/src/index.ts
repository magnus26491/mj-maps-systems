// ─────────────────────────────────────────────────────────────────────────────
// Turn Engine Service — HTTP microservice wrapping the turn-feasibility scorer
// POST /turn/score  { vehicleClass, roadGeometry } → TurnFeasibilityResult
// POST /turn/batch  { vehicleClass, segments[] }  → TurnFeasibilityResult[]
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';
import {
  VEHICLE_PROFILES,
  computeTurnScore,
  type RoadGeometry,
  type VehicleClass,
} from '../../../packages/vehicle-profiles/index';

const app = Fastify({ logger: true });

app.post<{ Body: { vehicleClass: VehicleClass; roadGeometry: RoadGeometry } }>(
  '/turn/score',
  {
    schema: {
      body: {
        type: 'object',
        required: ['vehicleClass', 'roadGeometry'],
        properties: {
          vehicleClass: { type: 'string' },
          roadGeometry: { type: 'object' },
        },
      },
    },
  },
  async (req, reply) => {
    const { vehicleClass, roadGeometry } = req.body;
    const vehicle = VEHICLE_PROFILES[vehicleClass];
    if (!vehicle) {
      return reply.status(400).send({ error: `Unknown vehicleClass: ${vehicleClass}` });
    }
    const result = computeTurnScore(vehicle, roadGeometry);
    return reply.send(result);
  },
);

app.post<{
  Body: { vehicleClass: VehicleClass; segments: RoadGeometry[] };
}>(
  '/turn/batch',
  async (req, reply) => {
    const { vehicleClass, segments } = req.body;
    const vehicle = VEHICLE_PROFILES[vehicleClass];
    if (!vehicle) {
      return reply.status(400).send({ error: `Unknown vehicleClass: ${vehicleClass}` });
    }
    const results = segments.map((road) => computeTurnScore(vehicle, road));
    return reply.send(results);
  },
);

app.get('/health', async () => ({ status: 'ok', service: 'turn-engine' }));

const PORT = Number(process.env.PORT ?? 3003);
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
