// ─────────────────────────────────────────────────────────────────────────────
// Access Engine
// Determines the safest, most efficient APPROACH to each stop:
//   - Which side of road to park on
//   - Whether driver should approach from ahead or loop back
//   - One-way street handling
//   - Gate / entrance offset application
//   - "Last 50 metres" instruction generation
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';

const app = Fastify({ logger: true });

export interface ApproachRequest {
  stopLat: number;
  stopLon: number;
  /** Current driver heading in degrees (0=N, 90=E, 180=S, 270=W) */
  driverHeading: number;
  /** Side of road the property sits on (from property-engine) */
  propertySide: 'left' | 'right' | 'either' | 'layby';
  /** Whether OSM tags this as one-way */
  isOneWay: boolean;
  /** Whether there is a known gate / entrance pin */
  hasEntrancePin: boolean;
  entranceLat?: number;
  entranceLon?: number;
  /** Access notes from property-engine */
  accessNotes: string[];
  /** Distance to stop in metres */
  distanceM: number;
}

export interface ApproachInstruction {
  /** Primary driver instruction */
  instruction: string;
  /** Secondary contextual hints */
  hints: string[];
  /** Whether driver needs to loop around to approach from opposite direction */
  requiresLoop: boolean;
  /** Recommended GPS target — entrance or stop pin */
  targetLat: number;
  targetLon: number;
  /** Metres from target to final delivery point */
  walkDistanceM: number;
}

export function buildApproachInstruction(req: ApproachRequest): ApproachInstruction {
  const hints: string[] = [];
  let requiresLoop = false;
  let targetLat = req.stopLat;
  let targetLon = req.stopLon;
  let walkDistanceM = 0;
  let instruction = '';

  // 1. Use entrance pin if available
  if (req.hasEntrancePin && req.entranceLat && req.entranceLon) {
    targetLat = req.entranceLat;
    targetLon = req.entranceLon;
    const d = haversineM(req.stopLat, req.stopLon, targetLat, targetLon);
    walkDistanceM = d;
    hints.push(`🚪 Entrance pin set — navigate to gate/entrance, not the property front door.`);
  }

  // 2. Side-of-road logic
  if (req.propertySide === 'left') {
    hints.push(`🛑 Property is on LEFT — park on left, no need to cross road.`);
    // If driver is currently approaching from the right (heading 90-270 roughly)
    // they may need to loop. Simplified heuristic:
    if (req.driverHeading > 135 && req.driverHeading < 315) {
      requiresLoop = true;
      hints.push(`↩️ You are approaching from the wrong direction — loop around to stop on the left.`);
    }
  } else if (req.propertySide === 'right') {
    hints.push(`🛑 Property is on RIGHT — park on right or find a safe pull-in.`);
    if (req.driverHeading > 315 || req.driverHeading < 135) {
      requiresLoop = true;
      hints.push(`↩️ Consider looping around to approach from the far end of the street.`);
    }
  } else if (req.propertySide === 'layby') {
    hints.push(`🅿️ Designated lay-by ahead — pull in fully before stopping.`);
  }

  // 3. One-way street
  if (req.isOneWay) {
    hints.push(`⚠️ ONE-WAY STREET — do not attempt to reverse back up the road.`);
    requiresLoop = true;
  }

  // 4. Distance-based last-50-metres instruction
  if (req.distanceM <= 50) {
    instruction = `📍 Arriving at stop — ${req.distanceM}m ahead.`;
  } else if (req.distanceM <= 150) {
    instruction = `🔜 Stop in ${Math.round(req.distanceM)}m — prepare to pull over.`;
  } else {
    instruction = `Continue ${Math.round(req.distanceM)}m to stop.`;
  }

  // 5. Append access notes
  if (req.accessNotes.length > 0) {
    hints.push(`📝 Access notes: ${req.accessNotes.join(' | ')}`);
  }

  return { instruction, hints, requiresLoop, targetLat, targetLon, walkDistanceM };
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Endpoints ────────────────────────────────────────────────────────────────
app.post<{ Body: ApproachRequest }>('/access/approach', async (req, reply) => {
  const result = buildApproachInstruction(req.body);
  return reply.send(result);
});

app.get('/health', async () => ({ status: 'ok', service: 'access-engine' }));

const PORT = Number(process.env.PORT ?? 3006);
app.listen({ port: PORT, host: '0.0.0.0' });
