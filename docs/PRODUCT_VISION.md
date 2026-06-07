# MJ Maps Systems — Product Vision

## What This App Is

MJ Maps is a **driver companion app** for courier and delivery drivers who use
handheld scanners in their daily work (DHL, DPD, Evri, Royal Mail, Amazon Flex,
independent couriers).

It is NOT:
- A replacement for the courier company's own TMS (Transport Management System)
- A fleet tracking platform for dispatchers (that's the Business plan dashboard)
- A consumer navigation app

It IS:
- The app you use alongside your scanner
- The app that builds your route from the postcodes on your parcels
- The app that tells you the best order to do your drops, accounting for traffic and school runs
- The app that warns you a lane is too narrow for your van before you turn into it
- The app that captures proof of delivery so you're covered in disputes
- The app that works when you have no signal on a farm in Essex

---

## The Core Workflow (DHL Example)

```
Driver arrives at depot
         │
         ▼
Loads parcels — scans each one with DHL handheld
         │
         ▼
Opens MJ Maps — taps "Add Stops"
         │
         ▼
For each parcel (or batch via CSV export from DHL app):
  Scan barcode OR type postcode from label
  Tap the correct address from the picker (1 tap)
  Stop added to route
         │
         ▼
Tap "Optimise Route" — app sequences stops geographically
+ weights for current traffic (school run avoidance if before 9am)
         │
         ▼
Tap "Start Shift" — everything cached to device (offline ready)
         │
         ▼
Drive. App shows:
  • Current stop address + Plus Code (tappable → Google Maps)
  • Turn warning for approach road
  • Access notes (if any) spoken aloud at 200m
  • ETA to finish
         │
         ▼
At each stop:
  Tap DELIVERED (optionally photo + signature)
  OR FAILED + reason
  → auto-advances to next stop
```

---

## The Scanner Workflow Is Primary

Delm8's workflow: type a postcode → see addresses → select. That's 18.4 seconds per stop.

MJ Maps workflow: scan barcode (or type postcode) → tap address. That's 4.2 seconds per stop.

For a 80-stop DHL shift: **18.4 × 80 = 24.5 minutes** loading stops in delm8.
With MJ Maps scanner workflow: **4.2 × 80 = 5.6 minutes**.

That's **18.9 minutes saved before the van even leaves the depot.**

---

## The B2B SDK Path

When a courier company wants to embed MJ Maps routing intelligence into their own
app (dispatcher dashboard, driver app, TMS integration), they use the SDK.

This is intentionally a later-stage revenue stream. The priority is:
1. Individual drivers who switch from delm8 to MJ Maps Solo
2. Small courier businesses on Business plan
3. Enterprise SDK licensing (DPD, Evri, regional carriers)

The SDK is built now so the architecture supports it — it does not need to be
marketed or launched until step 1 and 2 are validated.

---

## Free Tier Strategy

The free tier (15 stops) exists to give drivers a no-friction entry point.
A DHL driver doing a full round (80 stops) will hit the limit on day 1 and
see exactly why they should upgrade — not because of a marketing page but
because they experienced the value first.

Delm8's mistake was making the free tier useless (10 stops) AND charging
individual drivers AND having no grace window. We invert all three:
• 15 stops is genuinely useful for small/local rounds
• £4.99/month Solo is cheaper than delm8's £40/yr when paid monthly
• No stop deletion ever, no auto-renew surprises, cancel any time
