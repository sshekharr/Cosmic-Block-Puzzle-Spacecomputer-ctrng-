# Cosmic Block Puzzle

A production-ready **Next.js cosmic block puzzle game** with:
- Configurable puzzle grid size
- Configurable random blocks per seed batch
- Row/column clear mechanic
- Scoring + game-over detection
- Level mode (`easy`, `medium`, `hard`)
- Block rotation during play
- Orbitport cTRNG seed integration
- Animated Three.js wormhole background
- Docker one-command run

## Tech Stack

- Next.js (App Router) + TypeScript
- TailwindCSS + Framer Motion
- Three.js (background animation)
- Orbitport SDK (`@spacecomputer-io/orbitport-sdk-ts`)
- Docker + docker-compose

## How The Game Works

1. App calls `/api/random` once at game start.
2. API returns a seed from Orbitport.
3. Client creates deterministic PRNG from that seed.
4. Game uses that PRNG for block generation during the whole session.
5. Player places seeded random blocks on the configured grid size.
6. Full rows/columns clear and increase score.
7. Game ends when no valid move exists for available blocks.

## Randomness Flow

`/app/api/random/route.ts` uses fallback chain:
1. Orbitport SDK auto-source (`sdk.ctrng.random()`)
2. Force IPFS (`sdk.ctrng.random({ src: "ipfs", index: 0 })`)
3. Node crypto fallback (`crypto.randomBytes(32)`)

Response format:

```json
{
  "seed": "hex-string",
  "source": "trng|ipfs|crypto",
  "usedFallback": false
}
```

## Run Locally

```bash
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

## Run with Docker (One Click)

```bash
docker compose up --build
```

Open: [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create `.env` in project root:

```env
ORBITPORT_CLIENT_ID=your_client_id
ORBITPORT_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_GRID_SIZE=12
NEXT_PUBLIC_BLOCKS_PER_SEED=5
NEXT_PUBLIC_FALL_SPEED_EASY_MS=650
NEXT_PUBLIC_FALL_SPEED_MEDIUM_MS=450
NEXT_PUBLIC_FALL_SPEED_HARD_MS=280
NEXT_PUBLIC_PREFETCH_REMAINING_EASY=2
NEXT_PUBLIC_PREFETCH_REMAINING_MEDIUM=3
NEXT_PUBLIC_PREFETCH_REMAINING_HARD=3
NEXT_PUBLIC_BACKGROUND_ANIMATION_DEFAULT=true
```

Then restart dev server:

```bash
npm run dev
```

If not provided, API still works via IPFS/crypto fallback.

## Important Files

- `app/page.tsx` - Main game UI + interaction flow
- `app/api/random/route.ts` - Orbitport randomness endpoint
- `components/WormholeBackground.tsx` - Fullscreen animated wormhole
- `game/engine.ts` - Core puzzle rules
- `lib/prng.ts` - Deterministic seeded PRNG
- `Dockerfile` + `docker-compose.yml` - containerized deployment

## How To Modify

- Add new block types in `game/blocks.ts`
- Change scoring in `game/engine.ts`
- Tune wormhole visuals in `components/WormholeBackground.tsx`
- Update UI theme in `app/globals.css`
