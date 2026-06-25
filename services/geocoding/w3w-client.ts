/**
 * what3words adapter.
 *
 * Converts a 3-word address (e.g. "filled.count.soap") to precise coordinates
 * via the what3words REST API.
 *
 * Requires WHAT3WORDS_API_KEY env var. Returns null when unset.
 *
 * ⚠️  Provision: register at https://what3words.com/select-plan and get an
 *     API key. Set WHAT3WORDS_API_KEY in Railway variables.
 */

import * as https from 'https';
import * as http from 'http';
import type { DoorPin } from './types.js';

function getKey(): string | undefined {
  return process.env.WHAT3WORDS_API_KEY ?? process.env.W3W_API_KEY;
}

const W3W_BASE = 'https://api.what3words.com/v3';

const W3W_PATTERN = /^[a-z]+\.[a-z]+\.[a-z]+$/i;

interface W3wResponse {
  coordinates?: { lat: number; lng: number };
  words?: string;
  nearestPlace?: string;
  country?: string;
  error?: { code: string; message: string };
}

function httpGet(url: string, timeoutMs = 8_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const timer = setTimeout(() => reject(new Error(`what3words timed out after ${timeoutMs}ms`)), timeoutMs);
    lib.get(url, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => { body += c; });
      res.on('end', () => { clearTimeout(timer); resolve(body); });
    }).on('error', (err: Error) => { clearTimeout(timer); reject(err); });
  });
}

/** Returns true if the string looks like a W3W address */
export function isW3wAddress(s: string): boolean {
  return W3W_PATTERN.test(s.trim());
}

/** Resolve a 3-word address to precise coordinates. Returns null on any failure. */
export async function resolveW3wToDoorPin(words: string): Promise<DoorPin | null> {
  const key = getKey();
  if (!key) return null;
  if (!isW3wAddress(words)) return null;

  const clean = words.trim().toLowerCase().replace(/^\/\/\//, '');
  const url = `${W3W_BASE}/convert-to-coordinates?words=${encodeURIComponent(clean)}&key=${key}`;

  try {
    const raw = await httpGet(url);
    const data = JSON.parse(raw) as W3wResponse;

    if (data.error) {
      console.warn('[w3w] API error:', data.error.message);
      return null;
    }
    if (!data.coordinates) return null;

    return {
      lat: data.coordinates.lat,
      lng: data.coordinates.lng,
      source: 'what3words',
      confidence: 0.95,
    };
  } catch (err) {
    console.warn('[w3w] resolve failed:', (err as Error).message);
    return null;
  }
}
