/**
 * Centralised photo URL registry.
 *
 * All images are sourced from Unsplash (free licence) or generated assets.
 * To swap for real brand photos:
 *   1. Place optimised .webp + .png files in apps/landing/public/img/photos/
 *   2. Replace each value below with '/img/photos/<filename>.webp'
 *
 * Width param (w=) controls CDN resize — keep at or above largest rendered size.
 * q=85 gives a good quality/weight balance.
 */
export const photos = {
  /**
   * Hero background — white van on a misty UK road at dawn.
   * Unsplash: photo by Quinten de Graaf (truck/road, overcast)
   */
  heroVanDawn:
    'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1920&q=85&auto=format&fit=crop',

  /**
   * Turn-score section background — night-time UK road junction.
   * Unsplash: photo by Matt Jones (road at night, headlights)
   */
  turnScoreNight:
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1600&q=85&auto=format&fit=crop',

  /**
   * Founder / fleet section background — aerial view of delivery vans.
   * Unsplash: photo by Timelab (logistics warehouse / fleet)
   */
  fleetRouting:
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1600&q=85&auto=format&fit=crop',

  /**
   * Before/after supporting photo — MapLibre dark-map with teal precision
   * delivery pin. Replaces the stock telephone photo. Matches the product's
   * vector tile navigation aesthetic (OpenFreeMap / MapLibre dark theme).
   */
  gatePinDelivery:
    'https://user-gen-media-assets.s3.amazonaws.com/gpt4o_images/b1405735-d2d0-44eb-8f16-1d40cf00b095.png',

  /**
   * HeroHUD inset photo — dashboard / navigation screen at night.
   * Unsplash: photo by Samuele Errico Piccarini (dark road, headlights)
   */
  heroHudNight:
    'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&q=85&auto=format&fit=crop',
} as const;

export type PhotoKey = keyof typeof photos;
