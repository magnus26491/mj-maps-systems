# Photo assets

This directory is intentionally empty in the repository.

All photos are currently served via Unsplash CDN URLs defined in
`apps/landing/src/assets/photos.ts`.

## To switch to local assets

Place optimised files here using the names below, then update `photos.ts`
to point to `/img/photos/<name>` instead of the Unsplash URLs.

| Filename (webp + png pair) | Description |
|---|---|
| `hero-van-dawn.webp` / `.png` | White box van on foggy UK road — hero background |
| `turn-score-night.webp` / `.png` | Night-time road junction — turn-score section bg |
| `fleet-routing.webp` / `.png` | Aerial fleet / logistics — founder section bg |
| `gate-pin-delivery.webp` / `.png` | Driver at rural gate — before/after supporting photo |
| `hero-hud-night.webp` / `.png` | Dark road / dashboard — HeroHUD inset |

### Recommended spec
- Format: WebP primary, PNG fallback
- Max width: 1920px (hero), 1600px (section bgs), 800px (supporting)
- Quality: 85 WebP / 90 PNG
- Tool: `cwebp`, Squoosh, or `sharp` in a build script
