import { GAME_CONFIG } from "@/lib/gameConfig";

export const GRID_SIZE = GAME_CONFIG.gridSize;

export type CellValue = string | null;

export type Point = {
  x: number;
  y: number;
};

export type BlockTemplate = {
  id: string;
  name: string;
  color: string;
  cells: Point[];
};

export type BlockInstance = BlockTemplate & {
  instanceId: string;
};
