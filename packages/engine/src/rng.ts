/** Seeded RNG utilities (deterministic). */

// cyrb128 + mulberry32 adapted from common public-domain snippets.

export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeededRng {
  next(): number; // [0,1)
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(arr: readonly T[]): T;
}

export function makeRng(seedStr: string): SeededRng {
  const [a] = cyrb128(seedStr);
  const r = mulberry32(a);
  return {
    next: () => r(),
    int: (min, max) => {
      if (max < min) throw new Error('rng.int: max < min');
      const n = Math.floor(r() * (max - min + 1)) + min;
      return n;
    },
    pick: <T,>(arr: readonly T[]) => {
      if (arr.length === 0) throw new Error('rng.pick: empty array');
      return arr[Math.floor(r() * arr.length)]!;
    }
  };
}

/** 
 * Stateless RNG: returns a deterministic float [0, 1) based on the key.
 */
export function hashFloat(key: string): number {
  const [a] = cyrb128(key);
  // a is a 32-bit unsigned integer
  return a / 4294967296;
}

/**
 * Stateless RNG: returns a deterministic integer [min, max] based on the key.
 */
export function hashInt(key: string, min: number, max: number): number {
  if (max < min) throw new Error('hashInt: max < min');
  const f = hashFloat(key);
  return Math.floor(f * (max - min + 1)) + min;
}

