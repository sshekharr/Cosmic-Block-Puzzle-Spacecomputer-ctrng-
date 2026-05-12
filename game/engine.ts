import { BLOCK_LIBRARY } from "./blocks";
import { BlockInstance, BlockTemplate, CellValue, GRID_SIZE } from "./types";
import { PRNG } from "@/lib/prng";
import { GAME_CONFIG } from "@/lib/gameConfig";

export function createEmptyGrid(): CellValue[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );
}

export function createEmptyGridWithSize(gridSize: number): CellValue[][] {
  return Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => null));
}

function randomIndex(prng: PRNG, size: number): number {
  return Math.floor(prng() * size) % size;
}

function rotatePointClockwise(x: number, y: number): { x: number; y: number } {
  return { x: y, y: -x };
}

function normalizeCells(cells: { x: number; y: number }[]): { x: number; y: number }[] {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells.map((cell) => ({ x: cell.x - minX, y: cell.y - minY }));
}

function rotateCells(cells: { x: number; y: number }[], turns: number): { x: number; y: number }[] {
  let next = [...cells];
  for (let i = 0; i < turns; i++) {
    next = next.map((cell) => rotatePointClockwise(cell.x, cell.y));
    next = normalizeCells(next);
  }
  return next;
}

export function generateBlock(prng: PRNG, index = 0): BlockInstance {
  const template = BLOCK_LIBRARY[randomIndex(prng, BLOCK_LIBRARY.length)];
  const turns = randomIndex(prng, 4); // 0/90/180/270
  const rotatedCells = rotateCells(template.cells, turns);

  return {
    ...template,
    cells: rotatedCells,
    instanceId: `${template.id}-${Date.now()}-${index}-${Math.floor(prng() * 10000)}`,
  };
}

export function generateTurnBlocks(prng: PRNG): BlockInstance[] {
  return Array.from({ length: GAME_CONFIG.blocksPerSeed }, (_, i) => generateBlock(prng, i));
}

export function rotateBlockClockwise(block: BlockTemplate): BlockTemplate {
  return {
    ...block,
    cells: rotateCells(block.cells, 1),
  };
}

export function canPlaceBlock(
  grid: CellValue[][],
  block: BlockTemplate,
  baseRow: number,
  baseCol: number,
  gridSize = grid.length,
): boolean {
  return block.cells.every(({ x, y }) => {
    const row = baseRow + y;
    const col = baseCol + x;

    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) {
      return false;
    }

    return grid[row][col] === null;
  });
}

export function placeBlock(
  grid: CellValue[][],
  block: BlockTemplate,
  baseRow: number,
  baseCol: number,
): CellValue[][] {
  const next = grid.map((row) => [...row]);
  block.cells.forEach(({ x, y }) => {
    next[baseRow + y][baseCol + x] = block.color;
  });
  return next;
}

export function clearLines(grid: CellValue[][]): {
  grid: CellValue[][];
  clearedCount: number;
} {
  const next = grid.map((row) => [...row]);
  const gridSize = next.length;
  const rowsToClear: number[] = [];
  const colsToClear: number[] = [];

  for (let r = 0; r < gridSize; r++) {
    if (next[r].every((cell) => cell !== null)) {
      rowsToClear.push(r);
    }
  }

  for (let c = 0; c < gridSize; c++) {
    let full = true;
    for (let r = 0; r < gridSize; r++) {
      if (next[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) colsToClear.push(c);
  }

  rowsToClear.forEach((r) => {
    for (let c = 0; c < gridSize; c++) {
      next[r][c] = null;
    }
  });

  colsToClear.forEach((c) => {
    for (let r = 0; r < gridSize; r++) {
      next[r][c] = null;
    }
  });

  // Classic gravity: only shift whole rows down when full rows were cleared.
  // This keeps landed piece shape stable (no per-column "melting").
  if (rowsToClear.length > 0) {
    const keepRows = next.filter((_, rowIndex) => !rowsToClear.includes(rowIndex));
    const missingRows = gridSize - keepRows.length;
    const emptyRows = Array.from({ length: missingRows }, () =>
      Array.from({ length: gridSize }, () => null),
    );
    const shiftedGrid = [...emptyRows, ...keepRows];
    for (let r = 0; r < gridSize; r++) {
      next[r] = shiftedGrid[r];
    }
  }

  return { grid: next, clearedCount: rowsToClear.length + colsToClear.length };
}

export function scoreForMove(block: BlockTemplate, clearedCount: number): number {
  return block.cells.length * 5 + clearedCount * 100;
}

export function findDropRowForColumn(
  grid: CellValue[][],
  block: BlockTemplate,
  targetCol: number,
  gridSize = grid.length,
): number | null {
  let lastValidRow: number | null = null;

  for (let row = 0; row < gridSize; row++) {
    if (canPlaceBlock(grid, block, row, targetCol, gridSize)) {
      lastValidRow = row;
      continue;
    }

    if (lastValidRow !== null) {
      return lastValidRow;
    }
  }

  return lastValidRow;
}

export function hasAnyValidDropMove(
  grid: CellValue[][],
  block: BlockTemplate,
  gridSize = grid.length,
): boolean {
  for (let col = 0; col < gridSize; col++) {
    if (findDropRowForColumn(grid, block, col, gridSize) !== null) {
      return true;
    }
  }
  return false;
}

export function hasAnyValidMove(
  grid: CellValue[][],
  blocks: BlockTemplate[],
  gridSize = grid.length,
): boolean {
  for (const block of blocks) {
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (canPlaceBlock(grid, block, r, c, gridSize)) {
          return true;
        }
      }
    }
  }
  return false;
}
