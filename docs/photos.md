# MJ Maps — Photo Asset Guide

All photos in the landing site come from **Unsplash** (free commercial licence).
Every slot maps to a real photo of couriers, delivery vans, HGV trucks, or navigation UI.
No SVG illustrations are used as hero or background images.

## Photo Slots

| Slug | Unsplash ID | Subject | Used in |
|---|---|---|---|
| `hero-van-dawn` | `MsJ8PxyBrEA` | White van on misty UK road at dawn | index, about heroes |
| `drivers-van-lane` | `eMCHHxJtUzU` | Transit van on a sunny rural lane | drivers page hero + narrative |
| `turn-score-night` | `hrlvr2ZlUNk` | Night junction, street lights | turn-score demo bg |
| `gate-pin-delivery` | `UErWoQEoMrc` | Courier checking phone at a gate | gate-pin feature card |
| `pod-signature` | `DZpc4UY8ZtY` | Tablet signature handover | proof-of-delivery HeroHUD |
| `offline-no-signal` | `NPFu4GfFZ7E` | Remote rural road, no infrastructure | offline-cache HeroHUD |
| `fleet-routing` | `GOD2mDNujuU` | Aerial fleet of lorries in a yard | features, fleet, contact, pricing |
| `bridge-hgv` | `O--4pdRpKYY` | HGV approaching a low bridge | FeatureGrid featured card bg |

## How to Fetch Photos

```bash
# All photos (first-time setup or after manifest changes)
node scripts/fetch-photos.js

# Single slug
node scripts/fetch-photos.js hero-van-dawn

# With Unsplash API key (recommended for production — respects download tracking)
UNSPLASH_ACCESS_KEY=your_key node scripts/fetch-photos.js
```

Output goes to `apps/landing/public/img/photos/` as `.webp`, `@2x.webp`, and `.png`.

## Adding a New Photo

1. Find a photo on [unsplash.com](https://unsplash.com) — search for the subject (e.g. "delivery van", "HGV bridge", "courier GPS")
2. Copy the photo ID from the URL: `unsplash.com/photos/[photo-id]`
3. Add an entry to `scripts/photo-manifest.json`
4. Add the `<picture>` / `background-image` reference in the relevant `.astro` component
5. Run `node scripts/fetch-photos.js your-new-slug`
6. Commit both the manifest update and the generated image files

## Criteria for Photo Selection

- **Subject must be one of:** delivery van, courier, HGV truck, navigation/GPS UI, logistics yard, UK road network
- **No generic stock photos** — no smiling people in offices, no abstract gradients
- **Mood must match the dark cartographic theme** — moody lighting, dawn/dusk/night preferred for heroes
- **Resolution:** minimum 1920×1080 source for hero slots; 800×600 for feature cards
