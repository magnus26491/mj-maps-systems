# MJ Maps Systems — B2B SDK

Embed MJ Maps routing intelligence into your own logistics platform.

## What This SDK Is For

MJ Maps is **first and foremost a driver companion app** for individual couriers and
delivery drivers — used alongside existing scanner hardware (DHL Zebra, DPD scanner,
Evri handheld) to build and optimise a delivery route without switching apps.

The SDK unlocks the same routing engine for companies who want to integrate it
directly into their own fleet management or courier platform.

## Quick Start

```typescript
import { MJMapsClient } from '@mj-maps/sdk';

const client = new MJMapsClient({ apiKey: 'YOUR_ENTERPRISE_API_KEY' });

// Optimise a route from a list of stops
const route = await client.routes.optimise({
  vehicleId: 'luton',
  shiftStartISO: '2026-06-09T08:00:00Z',
  trafficAware: true,
  avoidSchoolRuns: true,
  stops: [
    { id: 's01', postcode: 'CM1 4PP', parcelCount: 1, requiresSig: false },
    { id: 's02', postcode: 'CM2 6GP', parcelCount: 3, requiresSig: true  },
    // ...
  ],
});

console.log(route.stops);           // ordered, enriched with ETAs + turn warnings
console.log(route.trafficSavingMin); // e.g. 31 (minutes saved vs naive ordering)
```

## Stop Input — Postcode First

The SDK is designed for the **scanner workflow**: input is a postcode (from the parcel
label, from a barcode scan, or manually typed), not a full address. The resolver
returns rooftop-level candidates; your app picks the correct one.

```typescript
// Resolve postcode to address candidates (as the driver would see them)
const candidates = await client.routes.resolve('CM1 4PP');
// returns [{address: '14 Orchard Lane, Chelmsford CM1 4PP', lat: ..., lng: ..., plusCode: '...'}]
```

## Webhooks

Get notified in real-time when delivery events occur:

```typescript
await client.webhooks.register({
  url: 'https://your-platform.com/webhooks/mjmaps',
  secret: 'YOUR_SIGNING_SECRET',
  events: ['stop.completed', 'stop.failed', 'shift.completed'],
});
```

Payloads are signed with HMAC-SHA256 using your secret. Verify:
```typescript
const sig  = req.headers['x-mjmaps-signature'];
const body = JSON.stringify(req.body);
const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
if (sig !== expected) throw new Error('Invalid signature');
```

## Supported Vehicle Profiles

| ID | Vehicle | Height | Width | Max Weight |
|---|---|---|---|---|
| `car` | Car | 1.5m | 1.8m | 0.5t |
| `swb_van` | SWB Van | 2.4m | 2.0m | 2.0t |
| `lwb_van` | LWB Van | 2.6m | 2.1m | 2.5t |
| `luton` | Luton Van | 3.2m | 2.3m | 3.5t |
| `luton_tail` | Luton+Tail | 3.2m | 2.3m | 3.8t |
| `hgv_75t` | 7.5t HGV | 3.7m | 2.5m | 7.5t |
| `hgv_18t` | 18t Rigid | 4.0m | 2.5m | 18t |
| `artic` | Artic | 4.0m | 2.5m | 40t |

## Pricing

SDK access is included in the **Enterprise plan**. Contact sales@mjmaps.co.uk.
The MJ Maps driver app (Solo/Business plans) does not require the SDK.
