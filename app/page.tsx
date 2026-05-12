"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import WormholeBackground from "@/components/WormholeBackground";
import {
  canPlaceBlock,
  clearLines,
  createEmptyGridWithSize,
  generateTurnBlocks,
  hasAnyValidDropMove,
  placeBlock,
  rotateBlockClockwise,
  scoreForMove,
} from "@/game/engine";
import { BlockInstance, type CellValue } from "@/game/types";
import { GAME_CONFIG, type LevelMode } from "@/lib/gameConfig";
import { createPRNG } from "@/lib/prng";

type Particle = {
  id: number;
  x: number;
  y: number;
  color: string;
};

type SeedPayload = {
  seed: string;
  source: string;
  usedFallback: boolean;
};

function createEmergencySeedPayload(): SeedPayload {
  return {
    seed: `${Date.now()}-local-fallback-seed`,
    source: "emergency",
    usedFallback: true,
  };
}

export default function Home() {
  const [selectedGridSize, setSelectedGridSize] = useState<number>(GAME_CONFIG.gridSize);
  const [grid, setGrid] = useState(createEmptyGridWithSize(GAME_CONFIG.gridSize));
  const [seed, setSeed] = useState<string>("");
  const [seedSource, setSeedSource] = useState<string>("loading...");
  const [usedFallback, setUsedFallback] = useState(false);
  const [score, setScore] = useState(0);
  const [blockQueue, setBlockQueue] = useState<BlockInstance[]>([]);
  const [currentBlock, setCurrentBlock] = useState<BlockInstance | null>(null);
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [levelMode, setLevelMode] = useState<LevelMode>("medium");
  const [backgroundAnimationEnabled, setBackgroundAnimationEnabled] = useState(
    GAME_CONFIG.backgroundAnimationDefault,
  );
  const [hasGameStarted, setHasGameStarted] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const isFetchingSeedRef = useRef(false);
  const gridRef = useRef<CellValue[][]>(createEmptyGridWithSize(GAME_CONFIG.gridSize));
  const currentBlockRef = useRef<BlockInstance | null>(null);
  const currentRowRef = useRef(0);
  const currentColRef = useRef(0);
  const gameOverRef = useRef(false);
  const isLoadingBatchRef = useRef(false);
  const lockCurrentBlockRef = useRef<(lockRow?: number, lockCol?: number) => void>(() => {});
  const gridTouchStartRef = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const liquidButtonClass =
    "relative overflow-hidden rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-semibold text-cyan-50 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_25px_rgba(0,0,0,0.35)] transition hover:bg-white/20 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_14px_30px_rgba(0,0,0,0.45)]";
  const mobileDockButtonClass =
    "relative min-h-[3rem] select-none overflow-hidden rounded-xl border border-white/25 bg-white/15 px-3 py-3 text-base font-semibold text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_20px_rgba(0,0,0,0.4)] active:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40";
  const fallDelayMs = GAME_CONFIG.levelFallSpeedMs[levelMode];
  const prefetchRemainingThreshold = GAME_CONFIG.prefetchRemainingByLevel[levelMode];
  const isLevelLocked = hasGameStarted && !gameOver;
  const isGridSizeLocked = hasGameStarted && !gameOver;
  const isBackgroundToggleLocked = hasGameStarted && !gameOver;
  const showMobilePlayDock = hasGameStarted && !gameOver;
  const gridSizeOptions = [10, 12, 15, 18];

  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  useEffect(() => {
    currentBlockRef.current = currentBlock;
  }, [currentBlock]);

  useEffect(() => {
    currentRowRef.current = currentRow;
  }, [currentRow]);

  useEffect(() => {
    currentColRef.current = currentCol;
  }, [currentCol]);

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    isLoadingBatchRef.current = isLoadingBatch;
  }, [isLoadingBatch]);

  const getSpawnCol = useCallback((block: BlockInstance) => {
    const width = Math.max(...block.cells.map((cell) => cell.x)) + 1;
    return Math.max(0, Math.floor((selectedGridSize - width) / 2));
  }, [selectedGridSize]);

  const spawnBlock = useCallback(
    (block: BlockInstance, nextGrid: CellValue[][]) => {
      const spawnCol = getSpawnCol(block);
      setCurrentBlock(block);
      setCurrentRow(0);
      setCurrentCol(spawnCol);
      if (!canPlaceBlock(nextGrid, block, 0, spawnCol, selectedGridSize)) {
        setGameOver(true);
      }
    },
    [getSpawnCol, selectedGridSize],
  );

  const fetchSeedPayload = useCallback(async (): Promise<SeedPayload> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Seed fetch timeout")), 3500);
    });

    const response = await Promise.race([
      fetch("/api/random", { cache: "no-store" }),
      timeoutPromise,
    ]);
    if (!response.ok) {
      throw new Error(`Seed API failed: ${response.status}`);
    }
    const data = (await response.json()) as Partial<SeedPayload>;
    if (!data.seed || !data.source || typeof data.usedFallback !== "boolean") {
      throw new Error("Seed API returned invalid data");
    }
    return data as SeedPayload;
  }, []);

  const createBatchFromSeed = useCallback((payload: SeedPayload) => {
    const nextPrng = createPRNG(payload.seed);
    return generateTurnBlocks(nextPrng);
  }, []);

  const startGameFromSeed = useCallback((payload: SeedPayload, activeGrid: CellValue[][]) => {
    setSeed(payload.seed);
    setSeedSource(payload.source);
    setUsedFallback(payload.usedFallback);

    const firstBlocks = createBatchFromSeed(payload);
    const firstBlock = firstBlocks[0] ?? null;
    setBlockQueue(firstBlocks.slice(1));
    if (firstBlock && !hasAnyValidDropMove(activeGrid, firstBlock, selectedGridSize)) {
      setGameOver(true);
    } else if (firstBlock) {
      spawnBlock(firstBlock, activeGrid);
    }
  }, [createBatchFromSeed, selectedGridSize, spawnBlock]);

  const appendQueueFromSeed = useCallback((payload: SeedPayload) => {
    setSeed(payload.seed);
    setSeedSource(payload.source);
    setUsedFallback(payload.usedFallback);

    const nextBlocks = createBatchFromSeed(payload);
    setBlockQueue((prev) => [...prev, ...nextBlocks]);
  }, [createBatchFromSeed]);

  const fetchSeedAndQueue = useCallback(async () => {
    if (isFetchingSeedRef.current) return;
    isFetchingSeedRef.current = true;
    setIsLoadingBatch(true);

    try {
      const data = await fetchSeedPayload();
      startGameFromSeed(data, gridRef.current);
    } catch {
      startGameFromSeed(createEmergencySeedPayload(), gridRef.current);
    } finally {
      isFetchingSeedRef.current = false;
      setIsLoadingBatch(false);
    }
  }, [fetchSeedPayload, startGameFromSeed]);

  const prefetchNextSeedBatch = useCallback(async () => {
    if (isFetchingSeedRef.current) return;
    isFetchingSeedRef.current = true;
    setIsLoadingBatch(true);

    try {
      const data = await fetchSeedPayload();
      appendQueueFromSeed(data);
    } catch {
      appendQueueFromSeed(createEmergencySeedPayload());
    } finally {
      isFetchingSeedRef.current = false;
      setIsLoadingBatch(false);
    }
  }, [appendQueueFromSeed, fetchSeedPayload]);

  const startFreshGame = useCallback(() => {
    const emptyGrid = createEmptyGridWithSize(selectedGridSize);
    setHasGameStarted(true);
    setGrid(emptyGrid);
    gridRef.current = emptyGrid;
    setScore(0);
    setGameOver(false);
    setCurrentBlock(null);
    setCurrentRow(0);
    setCurrentCol(0);
    setBlockQueue([]);
    fetchSeedAndQueue();
  }, [fetchSeedAndQueue, selectedGridSize]);

  const spawnParticles = (row: number, col: number, color: string) => {
    const batch = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: col,
      y: row,
      color,
    }));
    setParticles((prev) => [...prev, ...batch]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !batch.some((b) => b.id === p.id)));
    }, 550);
  };

  const lockCurrentBlock = useCallback((lockRow = currentRow, lockCol = currentCol) => {
    if (!currentBlock) return;

    let nextGrid = placeBlock(grid, currentBlock, lockRow, lockCol);
    const cleared = clearLines(nextGrid);
    nextGrid = cleared.grid;

    setGrid(nextGrid);
    gridRef.current = nextGrid;
    setScore((prev) => prev + scoreForMove(currentBlock, cleared.clearedCount));
    spawnParticles(lockRow, lockCol, currentBlock.color);

    if (blockQueue.length > 0) {
      const nextBlock = blockQueue[0];
      const nextQueue = blockQueue.slice(1);
      setBlockQueue(nextQueue);

      if (!hasAnyValidDropMove(nextGrid, nextBlock, selectedGridSize)) {
        setGameOver(true);
        setCurrentBlock(null);
        return;
      }
      spawnBlock(nextBlock, nextGrid);
      return;
    }

    setCurrentBlock(null);
    setBlockQueue([]);
    fetchSeedAndQueue();
  }, [blockQueue, currentBlock, currentCol, currentRow, fetchSeedAndQueue, grid, selectedGridSize, spawnBlock]);

  useEffect(() => {
    lockCurrentBlockRef.current = lockCurrentBlock;
  }, [lockCurrentBlock]);

  const stepDown = useCallback(() => {
    const block = currentBlockRef.current;
    if (!block || gameOverRef.current || isLoadingBatchRef.current) return;

    const nextRow = currentRowRef.current + 1;
    if (canPlaceBlock(gridRef.current, block, nextRow, currentColRef.current, selectedGridSize)) {
      currentRowRef.current = nextRow;
      setCurrentRow(nextRow);
      return;
    }

    lockCurrentBlockRef.current(currentRowRef.current, currentColRef.current);
  }, [selectedGridSize]);

  const moveHorizontal = useCallback(
    (delta: number) => {
      const block = currentBlockRef.current;
      if (!block || gameOverRef.current || isLoadingBatchRef.current) return;
      const nextCol = currentColRef.current + delta;
      if (canPlaceBlock(gridRef.current, block, currentRowRef.current, nextCol, selectedGridSize)) {
        currentColRef.current = nextCol;
        setCurrentCol(nextCol);
      }
    },
    [selectedGridSize],
  );

  const hardDrop = useCallback(() => {
    const block = currentBlockRef.current;
    if (!block || gameOverRef.current || isLoadingBatchRef.current) return;

    let landingRow = currentRowRef.current;
    while (canPlaceBlock(gridRef.current, block, landingRow + 1, currentColRef.current, selectedGridSize)) {
      landingRow += 1;
    }

    currentRowRef.current = landingRow;
    setCurrentRow(landingRow);
    lockCurrentBlockRef.current(landingRow, currentColRef.current);
  }, [selectedGridSize]);

  const rotateCurrentBlock = useCallback(() => {
    const block = currentBlockRef.current;
    if (!block || gameOverRef.current || isLoadingBatchRef.current) return;

    const rotated = rotateBlockClockwise(block) as BlockInstance;
    if (canPlaceBlock(gridRef.current, rotated, currentRowRef.current, currentColRef.current, selectedGridSize)) {
      setCurrentBlock({ ...rotated, instanceId: `${block.instanceId}-r` });
      return;
    }

    const kickOffsets = [-1, 1, -2, 2];
    for (const offset of kickOffsets) {
      const kickedCol = currentColRef.current + offset;
      if (canPlaceBlock(gridRef.current, rotated, currentRowRef.current, kickedCol, selectedGridSize)) {
        currentColRef.current = kickedCol;
        setCurrentCol(kickedCol);
        setCurrentBlock({ ...rotated, instanceId: `${block.instanceId}-r${offset}` });
        return;
      }
    }
  }, [selectedGridSize]);

  useEffect(() => {
    if (!currentBlock || gameOver || isLoadingBatch) return;
    const timer = window.setTimeout(() => {
      stepDown();
    }, fallDelayMs);
    return () => window.clearTimeout(timer);
  }, [currentBlock, currentRow, currentCol, fallDelayMs, gameOver, isLoadingBatch, stepDown]);

  useEffect(() => {
    if (!hasGameStarted || gameOver || !currentBlock) return;
    if (isFetchingSeedRef.current) return;
    if (blockQueue.length <= prefetchRemainingThreshold) {
      const timer = window.setTimeout(() => {
        prefetchNextSeedBatch();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    blockQueue.length,
    currentBlock,
    gameOver,
    hasGameStarted,
    prefetchNextSeedBatch,
    prefetchRemainingThreshold,
  ]);

  useEffect(() => {
    if (!hasGameStarted || gameOver || currentBlock || blockQueue.length === 0) return;
    const timer = window.setTimeout(() => {
      const nextBlock = blockQueue[0];
      const nextQueue = blockQueue.slice(1);
      setBlockQueue(nextQueue);

      if (!hasAnyValidDropMove(gridRef.current, nextBlock, selectedGridSize)) {
        setGameOver(true);
        return;
      }
      spawnBlock(nextBlock, gridRef.current);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [blockQueue, currentBlock, gameOver, hasGameStarted, selectedGridSize, spawnBlock]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") moveHorizontal(-1);
      if (event.key === "ArrowRight") moveHorizontal(1);
      if (event.key === "ArrowDown") stepDown();
      if (event.key === "r" || event.key === "R") rotateCurrentBlock();
      if (event.key === " " || event.key === "ArrowUp") {
        event.preventDefault();
        hardDrop();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hardDrop, moveHorizontal, rotateCurrentBlock, stepDown]);

  const gridTouchGesturesEnabled = hasGameStarted && !gameOver && !isLoadingBatch && !!currentBlock;

  const onGridTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!gridTouchGesturesEnabled) return;
      if (event.touches.length !== 1) {
        gridTouchStartRef.current = null;
        return;
      }
      const touch = event.touches[0];
      gridTouchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now(), id: touch.identifier };
    },
    [gridTouchGesturesEnabled],
  );

  const onGridTouchEnd = useCallback(
    (event: TouchEvent) => {
      const start = gridTouchStartRef.current;
      gridTouchStartRef.current = null;
      if (!start || !gridTouchGesturesEnabled) return;

      let touch: Touch | null = null;
      for (let i = 0; i < event.changedTouches.length; i += 1) {
        const candidate = event.changedTouches.item(i);
        if (candidate && candidate.identifier === start.id) {
          touch = candidate;
          break;
        }
      }
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const elapsed = Date.now() - start.t;
      const distance = Math.hypot(dx, dy);

      const tapMaxDistancePx = 14;
      const tapMaxMs = 420;
      const swipeMinPx = 36;

      if (distance <= tapMaxDistancePx && elapsed <= tapMaxMs) {
        rotateCurrentBlock();
        return;
      }

      if (distance < swipeMinPx) return;

      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx <= -swipeMinPx) moveHorizontal(-1);
        else if (dx >= swipeMinPx) moveHorizontal(1);
      }
    },
    [gridTouchGesturesEnabled, moveHorizontal, rotateCurrentBlock],
  );

  const onGridTouchCancel = useCallback(() => {
    gridTouchStartRef.current = null;
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {backgroundAnimationEnabled && <WormholeBackground />}

      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 ${
          showMobilePlayDock
            ? "max-lg:pb-[calc(11rem+env(safe-area-inset-bottom,0px))]"
            : ""
        }`}
      >
        <header className="rounded-2xl border border-cyan-300/25 bg-white/10 p-4 backdrop-blur-xl shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          <a
            href="https://spacecomputer.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20"
          >
            <Image
              src="https://spacecomputer.io/favicon.ico"
              alt="SpaceComputer logo"
              width={20}
              height={20}
              className="h-5 w-5 rounded-sm"
              unoptimized
            />
            SpaceComputer
          </a>
          <h1 className="mt-3 text-2xl font-bold tracking-wide text-cyan-300 md:text-3xl">
            <span className="block">SpaceComputer cTRNG</span>
            <span className="block text-cyan-100">Cosmic Block Puzzle</span>
          </h1>
          <p className="mt-2 text-sm text-cyan-100/80">
            One block spawns at a time from a hidden {GAME_CONFIG.blocksPerSeed}-block cosmic queue.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-purple-300/40 bg-purple-500/20 px-3 py-1">
              Score: <strong>{score}</strong>
            </span>
            <span className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-3 py-1">
              Seed Source: <strong>{seedSource}</strong>
            </span>
            <span className="rounded-full border border-yellow-300/40 bg-yellow-500/20 px-3 py-1">
              Fallback: <strong>{usedFallback ? "Yes" : "No"}</strong>
            </span>
            <span className="rounded-full border border-cyan-300/40 bg-cyan-500/20 px-3 py-1">
              Hidden Queue: <strong>{blockQueue.length}</strong>
            </span>
            <span className="rounded-full border border-indigo-300/40 bg-indigo-500/20 px-3 py-1">
              Level: <strong className="capitalize">{levelMode}</strong>
            </span>
            <span className="rounded-full border border-fuchsia-300/40 bg-fuchsia-500/20 px-3 py-1">
              Grid: <strong>{selectedGridSize}x{selectedGridSize}</strong>
            </span>
          </div>
          <p className="mt-3 break-all text-xs text-cyan-100/70">Seed: {seed || "fetching..."}</p>
        </header>

        <main className="grid max-lg:grid-flow-dense gap-6 lg:grid-cols-[1fr_320px]">
          <section className="relative max-lg:order-1 rounded-2xl border border-cyan-200/20 bg-white/10 p-2 backdrop-blur-xl shadow-[0_12px_30px_rgba(0,0,0,0.35)] sm:p-3 md:p-4">
            <div
              className={`grid gap-1 ${gridTouchGesturesEnabled ? "touch-none select-none" : ""}`}
              style={{ gridTemplateColumns: `repeat(${selectedGridSize}, minmax(0, 1fr))` }}
              onTouchStart={onGridTouchStart}
              onTouchEnd={onGridTouchEnd}
              onTouchCancel={onGridTouchCancel}
            >
              {grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => {
                  const glow = cell ? { backgroundColor: cell, boxShadow: `0 0 14px ${cell}` } : undefined;
                  const isFallingCell =
                    !!currentBlock &&
                    currentBlock.cells.some(
                      (cellPart) =>
                        currentCol + cellPart.x === colIndex && currentRow + cellPart.y === rowIndex,
                    );

                  return (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      className="aspect-square rounded-lg border border-white/15 bg-white/10 backdrop-blur-md"
                      style={
                        isFallingCell && currentBlock
                          ? {
                              backgroundColor: currentBlock.color,
                            boxShadow: `0 0 18px ${currentBlock.color}, inset 0 0 12px rgba(255,255,255,0.2)`,
                            }
                          : cell
                            ? {
                              ...glow,
                              boxShadow: `${glow?.boxShadow}, inset 0 0 10px rgba(255,255,255,0.15)`,
                            }
                            : undefined
                      }
                    />
                  );
                }),
              )}
            </div>

            <AnimatePresence>
              {particles.map((particle) => (
                <motion.div
                  key={particle.id}
                  initial={{ opacity: 1, x: particle.x * 2, y: particle.y * 2, scale: 1 }}
                  animate={{ opacity: 0, y: particle.y * 2 - 40, scale: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="pointer-events-none absolute h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: particle.color,
                    boxShadow: `0 0 12px ${particle.color}`,
                  }}
                />
              ))}
            </AnimatePresence>
          </section>

          <aside className="max-lg:order-2 space-y-4 rounded-2xl border border-cyan-300/25 bg-white/10 p-4 backdrop-blur-xl shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <h2 className="text-lg font-semibold text-cyan-200">Current Falling Block</h2>
            {currentBlock ? (
              <div className="w-full rounded-xl border border-cyan-200/20 bg-white/10 p-3 backdrop-blur-lg">
                <p className="mb-2 text-sm font-medium">{currentBlock.name}</p>
                <p className="mb-2 text-xs text-cyan-100/80">
                  <span className="hidden lg:inline">
                    Controls: Left/Right move, Down step, R rotate, Space hard drop.
                  </span>
                  <span className="lg:hidden">
                    Swipe on the board left or right to move; tap the board to rotate. You can also use the bottom
                    bar.
                  </span>
                </p>
                <div className="grid w-16 grid-cols-4 gap-1">
                  {Array.from({ length: 16 }).map((_, idx) => {
                    const x = idx % 4;
                    const y = Math.floor(idx / 4);
                    const hasCell = currentBlock.cells.some((cell) => cell.x === x && cell.y === y);
                    return (
                      <div
                        key={idx}
                        className="h-3 w-3 rounded border border-white/20 bg-white/10"
                        style={
                          hasCell
                            ? {
                                backgroundColor: currentBlock.color,
                                boxShadow: `0 0 8px ${currentBlock.color}`,
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-cyan-400/30 bg-black/30 p-3 text-sm text-cyan-100/80">
                Fetching next cosmic batch...
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={startFreshGame}
              className={`w-full ${liquidButtonClass}`}
            >
              {hasGameStarted ? "New Game" : "Start Game"}
            </motion.button>

            <div className="grid grid-cols-3 gap-2 text-xs">
              {(["easy", "medium", "hard"] as LevelMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (!isLevelLocked) setLevelMode(mode);
                  }}
                  disabled={isLevelLocked}
                  className={`rounded-lg border px-3 py-2 font-semibold capitalize transition ${
                    levelMode === mode
                      ? "border-cyan-200/70 bg-cyan-400/25 text-cyan-50"
                      : "border-white/20 bg-white/10 text-cyan-100 hover:bg-white/20"
                  } ${isLevelLocked ? "cursor-not-allowed opacity-50" : ""}
                `}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {gridSizeOptions.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    if (!isGridSizeLocked) setSelectedGridSize(size);
                  }}
                  disabled={isGridSizeLocked}
                  className={`rounded-lg border px-3 py-2 font-semibold transition ${
                    selectedGridSize === size
                      ? "border-fuchsia-200/70 bg-fuchsia-400/25 text-fuchsia-50"
                      : "border-white/20 bg-white/10 text-cyan-100 hover:bg-white/20"
                  } ${isGridSizeLocked ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {size}x{size}
                </button>
              ))}
            </div>
            {isLevelLocked ? (
              <p className="text-xs text-cyan-100/70">
                Level, grid size, and background animation are locked during gameplay and unlock at game over.
              </p>
            ) : !hasGameStarted ? (
              <p className="text-xs text-cyan-100/70">
                Select your level and grid size, then press <strong>Start Game</strong>.
              </p>
            ) : (
              <p className="text-xs text-cyan-100/70">
                Game over - you can now change level and grid size before restarting.
              </p>
            )}

            <div className="hidden lg:contents">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <motion.button
                  type="button"
                  onClick={() => moveHorizontal(-1)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={liquidButtonClass}
                >
                  Left
                </motion.button>
                <motion.button
                  type="button"
                  onClick={stepDown}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={liquidButtonClass}
                >
                  Down
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => moveHorizontal(1)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={liquidButtonClass}
                >
                  Right
                </motion.button>
              </div>
              <motion.button
                type="button"
                onClick={rotateCurrentBlock}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full text-sm ${liquidButtonClass}`}
              >
                Rotate
              </motion.button>
              <motion.button
                type="button"
                onClick={hardDrop}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full text-sm ${liquidButtonClass}`}
              >
                Hard Drop
              </motion.button>
            </div>

            {gameOver && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-rose-300/40 bg-rose-500/20 p-3 text-sm"
              >
                No valid moves left. Press <strong>New Game</strong> to restart.
              </motion.div>
            )}
          </aside>
        </main>
      </div>

      {!hasGameStarted && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-200/30 bg-white/10 p-6 text-center shadow-[0_20px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <h3 className="text-2xl font-bold text-cyan-200">Choose Level & Grid</h3>
            <p className="mt-2 text-sm text-cyan-100/80">
              Pick a mode before starting. You can change it again only after game over.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              {(["easy", "medium", "hard"] as LevelMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLevelMode(mode)}
                  className={`rounded-lg border px-3 py-2 font-semibold capitalize transition ${
                    levelMode === mode
                      ? "border-cyan-200/70 bg-cyan-400/25 text-cyan-50"
                      : "border-white/20 bg-white/10 text-cyan-100 hover:bg-white/20"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
              {gridSizeOptions.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedGridSize(size)}
                  className={`rounded-lg border px-3 py-2 font-semibold transition ${
                    selectedGridSize === size
                      ? "border-fuchsia-200/70 bg-fuchsia-400/25 text-fuchsia-50"
                      : "border-white/20 bg-white/10 text-cyan-100 hover:bg-white/20"
                  }`}
                >
                  {size}x{size}
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-cyan-200/20 bg-black/30 p-3 text-left">
              <p className="text-xs font-semibold text-cyan-200">Background Animation</p>
              <button
                type="button"
                onClick={() => setBackgroundAnimationEnabled((prev) => !prev)}
                disabled={isBackgroundToggleLocked}
                className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  backgroundAnimationEnabled
                    ? "border-emerald-200/70 bg-emerald-400/25 text-emerald-50"
                    : "border-slate-200/50 bg-slate-500/20 text-slate-100"
                } ${isBackgroundToggleLocked ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {backgroundAnimationEnabled ? "On" : "Off"}
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-cyan-200/35 bg-black/50 p-4 text-left text-sm leading-6 text-cyan-50">
              <p className="font-semibold text-cyan-200">How to Play</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Move block: <span className="font-medium text-white">Left / Right</span> arrows (or on-screen
                  buttons)
                </li>
                <li>
                  Soft drop: <span className="font-medium text-white">Down</span> | Hard drop:{" "}
                  <span className="font-medium text-white">Space / Up</span>
                </li>
                <li>
                  Rotate block: <span className="font-medium text-white">R</span> key or{" "}
                  <span className="font-medium text-white">Rotate</span> button
                </li>
                <li className="lg:hidden">
                  Touch the board: swipe <span className="font-medium text-white">left / right</span> to move, or{" "}
                  <span className="font-medium text-white">tap</span> to rotate.
                </li>
                <li>Fill full rows or columns to clear them and gain points</li>
                <li>Game over when the next block has no valid placement</li>
              </ul>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={startFreshGame}
              className={`mt-5 w-full ${liquidButtonClass}`}
            >
              Start Game
            </motion.button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {gameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
              className="w-full max-w-sm rounded-2xl border border-cyan-200/30 bg-white/15 p-6 text-center backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
            >
              <h3 className="text-2xl font-bold text-cyan-200">Game Over</h3>
              <p className="mt-2 text-sm text-cyan-100/85">Your final score is {score}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                {(["easy", "medium", "hard"] as LevelMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLevelMode(mode)}
                    className={`rounded-lg border px-3 py-2 font-semibold capitalize transition ${
                      levelMode === mode
                        ? "border-cyan-200/70 bg-cyan-400/25 text-cyan-50"
                        : "border-white/20 bg-white/10 text-cyan-100 hover:bg-white/20"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
                {gridSizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedGridSize(size)}
                    className={`rounded-lg border px-3 py-2 font-semibold transition ${
                      selectedGridSize === size
                        ? "border-fuchsia-200/70 bg-fuchsia-400/25 text-fuchsia-50"
                        : "border-white/20 bg-white/10 text-cyan-100 hover:bg-white/20"
                    }`}
                  >
                    {size}x{size}
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-cyan-200/20 bg-black/30 p-3 text-left">
                <p className="text-xs font-semibold text-cyan-200">Background Animation</p>
                <button
                  type="button"
                  onClick={() => setBackgroundAnimationEnabled((prev) => !prev)}
                  className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    backgroundAnimationEnabled
                      ? "border-emerald-200/70 bg-emerald-400/25 text-emerald-50"
                      : "border-slate-200/50 bg-slate-500/20 text-slate-100"
                  }`}
                >
                  {backgroundAnimationEnabled ? "On" : "Off"}
                </button>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={startFreshGame}
                className={`mt-5 w-full ${liquidButtonClass}`}
              >
                Start New Game
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showMobilePlayDock && (
        <div
          className="fixed inset-x-0 bottom-0 z-[25] border-t border-cyan-300/35 bg-black/90 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] backdrop-blur-xl lg:hidden"
          role="toolbar"
          aria-label="Block controls"
        >
          <div className="mx-auto mb-2 flex max-w-lg items-center justify-between gap-2 px-0.5 text-xs text-cyan-100/90">
            <span>
              Score: <strong className="text-cyan-50">{score}</strong>
            </span>
            <span className="truncate text-right text-cyan-200/90">
              {currentBlock ? currentBlock.name : isLoadingBatch ? "Loading…" : "—"}
            </span>
          </div>
          <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
            <motion.button
              type="button"
              disabled={isLoadingBatch}
              onClick={() => moveHorizontal(-1)}
              whileTap={{ scale: 0.96 }}
              className={mobileDockButtonClass}
            >
              Left
            </motion.button>
            <motion.button
              type="button"
              disabled={isLoadingBatch}
              onClick={stepDown}
              whileTap={{ scale: 0.96 }}
              className={mobileDockButtonClass}
            >
              Down
            </motion.button>
            <motion.button
              type="button"
              disabled={isLoadingBatch}
              onClick={() => moveHorizontal(1)}
              whileTap={{ scale: 0.96 }}
              className={mobileDockButtonClass}
            >
              Right
            </motion.button>
          </div>
          <div className="mx-auto mt-2 grid max-w-lg grid-cols-2 gap-2">
            <motion.button
              type="button"
              disabled={isLoadingBatch}
              onClick={rotateCurrentBlock}
              whileTap={{ scale: 0.97 }}
              className={mobileDockButtonClass}
            >
              Rotate
            </motion.button>
            <motion.button
              type="button"
              disabled={isLoadingBatch}
              onClick={hardDrop}
              whileTap={{ scale: 0.97 }}
              className={mobileDockButtonClass}
            >
              Hard Drop
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
