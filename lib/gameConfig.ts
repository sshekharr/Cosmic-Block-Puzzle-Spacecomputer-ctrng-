const MIN_GRID_SIZE = 8;
const MAX_GRID_SIZE = 20;
const MIN_BLOCKS_PER_SEED = 1;
const MAX_BLOCKS_PER_SEED = 12;
const MIN_FALL_SPEED_MS = 80;
const MAX_FALL_SPEED_MS = 2000;
const MIN_PREFETCH_REMAINING = 1;
const MAX_PREFETCH_REMAINING = 8;

function parseNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export const GAME_CONFIG = {
  gridSize: parseNumber(process.env.NEXT_PUBLIC_GRID_SIZE, 12, MIN_GRID_SIZE, MAX_GRID_SIZE),
  blocksPerSeed: parseNumber(
    process.env.NEXT_PUBLIC_BLOCKS_PER_SEED,
    5,
    MIN_BLOCKS_PER_SEED,
    MAX_BLOCKS_PER_SEED,
  ),
  levelFallSpeedMs: {
    easy: parseNumber(process.env.NEXT_PUBLIC_FALL_SPEED_EASY_MS, 650, MIN_FALL_SPEED_MS, MAX_FALL_SPEED_MS),
    medium: parseNumber(
      process.env.NEXT_PUBLIC_FALL_SPEED_MEDIUM_MS,
      450,
      MIN_FALL_SPEED_MS,
      MAX_FALL_SPEED_MS,
    ),
    hard: parseNumber(process.env.NEXT_PUBLIC_FALL_SPEED_HARD_MS, 280, MIN_FALL_SPEED_MS, MAX_FALL_SPEED_MS),
  },
  prefetchRemainingByLevel: {
    easy: parseNumber(
      process.env.NEXT_PUBLIC_PREFETCH_REMAINING_EASY,
      2,
      MIN_PREFETCH_REMAINING,
      MAX_PREFETCH_REMAINING,
    ),
    medium: parseNumber(
      process.env.NEXT_PUBLIC_PREFETCH_REMAINING_MEDIUM,
      3,
      MIN_PREFETCH_REMAINING,
      MAX_PREFETCH_REMAINING,
    ),
    hard: parseNumber(
      process.env.NEXT_PUBLIC_PREFETCH_REMAINING_HARD,
      3,
      MIN_PREFETCH_REMAINING,
      MAX_PREFETCH_REMAINING,
    ),
  },
  backgroundAnimationDefault: parseBoolean(process.env.NEXT_PUBLIC_BACKGROUND_ANIMATION_DEFAULT, true),
} as const;

export type LevelMode = keyof typeof GAME_CONFIG.levelFallSpeedMs;
