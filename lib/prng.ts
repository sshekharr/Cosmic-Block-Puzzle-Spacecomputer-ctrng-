export type PRNG = () => number;
const MOD = BigInt(2) ** BigInt(32);
const MULTIPLIER = BigInt(1664525);
const INCREMENT = BigInt(1013904223);
const THOUSAND = BigInt(1000);

// Deterministic PRNG used for all game randomness after initial seed fetch.
export function createPRNG(seed: string): PRNG {
  const sanitized = seed.startsWith("0x") ? seed.slice(2) : seed;
  const base = sanitized.length > 10 ? sanitized.slice(0, 10) : sanitized;

  let state: bigint;
  try {
    state = BigInt(`0x${base}`);
  } catch {
    state = BigInt(123456789);
  }

  return () => {
    state = (state * MULTIPLIER + INCREMENT) % MOD;
    return Number(state % THOUSAND) / 1000;
  };
}
