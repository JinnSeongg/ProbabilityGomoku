import type { Cell, ForbiddenReason, RenjuMoveAnalysis, StoneColor } from "./types";

type Direction = readonly [dx: number, dy: number];
type VirtualStones = ReadonlyMap<string, StoneColor>;

const DIRECTIONS: Direction[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
];

function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

// Adds a virtual stone without mutating the real Cell[][] board.
function withStone(virtual: VirtualStones, x: number, y: number, color: StoneColor): VirtualStones {
  const next = new Map(virtual);
  next.set(pointKey(x, y), color);
  return next;
}

// Treats coordinates outside board[y][x] as blocked.
function inBounds(board: Cell[][], x: number, y: number): boolean {
  return Boolean(board[y]?.[x]);
}

// Reads real board state with virtual stones taking precedence.
function stoneAt(board: Cell[][], x: number, y: number, virtual: VirtualStones): StoneColor | null | undefined {
  if (!inBounds(board, x, y)) return undefined;
  return virtual.get(pointKey(x, y)) ?? board[y][x].stone;
}

// Candidate moves must be in bounds and genuinely empty.
function isEmpty(board: Cell[][], x: number, y: number, virtual: VirtualStones): boolean {
  return stoneAt(board, x, y, virtual) === null;
}

// Returns the full contiguous run through a point in one direction.
function lineRun(board: Cell[][], x: number, y: number, color: StoneColor, [dx, dy]: Direction, virtual: VirtualStones): Array<{ x: number; y: number }> {
  const line = [{ x, y }];
  for (const sign of [-1, 1]) {
    let nx = x + dx * sign;
    let ny = y + dy * sign;
    while (stoneAt(board, nx, ny, virtual) === color) {
      line.push({ x: nx, y: ny });
      nx += dx * sign;
      ny += dy * sign;
    }
  }
  return line.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
}

// Used to ensure a simulated threat was created by the current move.
function containsPoint(line: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  return line.some((point) => point.x === x && point.y === y);
}

// Black wins only by exactly five, so this rejects six-or-more runs.
function exactFiveInDirection(board: Cell[][], x: number, y: number, color: StoneColor, direction: Direction, virtual: VirtualStones): Array<{ x: number; y: number }> {
  const line = lineRun(board, x, y, color, direction, virtual);
  return line.length === 5 ? line : [];
}

// Overline is checked in every direction from the simulated black stone.
function hasOverlineAt(board: Cell[][], x: number, y: number, color: StoneColor, virtual: VirtualStones): boolean {
  return DIRECTIONS.some((direction) => lineRun(board, x, y, color, direction, virtual).length >= 6);
}

// Finds one exact five line through the move, if it exists.
function exactFiveLineAt(board: Cell[][], x: number, y: number, color: StoneColor, virtual: VirtualStones): Array<{ x: number; y: number }> {
  for (const direction of DIRECTIONS) {
    const line = exactFiveInDirection(board, x, y, color, direction, virtual);
    if (line.length === 5) return line;
  }
  return [];
}

// Only nearby empty cells on the same row can complete a three or four.
function lineCandidates(board: Cell[][], x: number, y: number, [dx, dy]: Direction, virtual: VirtualStones): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let offset = -5; offset <= 5; offset += 1) {
    if (offset === 0) continue;
    const nx = x + dx * offset;
    const ny = y + dy * offset;
    if (isEmpty(board, nx, ny, virtual)) candidates.push({ x: nx, y: ny });
  }
  return candidates;
}

// Counts directions that have at least one legal next move to exact five.
function countFourThreats(board: Cell[][], x: number, y: number, color: StoneColor, virtual: VirtualStones): number {
  const threats = new Set<string>();
  DIRECTIONS.forEach((direction, index) => {
    for (const candidate of lineCandidates(board, x, y, direction, virtual)) {
      const nextVirtual = withStone(virtual, candidate.x, candidate.y, color);
      const line = exactFiveInDirection(board, candidate.x, candidate.y, color, direction, nextVirtual);
      if (line.length !== 5) continue;
      if (!containsPoint(line, x, y)) continue;
      if (hasOverlineAt(board, candidate.x, candidate.y, color, nextVirtual)) continue;
      threats.add(String(index));
    }
  });
  return threats.size;
}

// Open four means two distinct non-overline winning completions in the row.
function createsOpenFourInDirection(board: Cell[][], originX: number, originY: number, direction: Direction, color: StoneColor, virtual: VirtualStones): boolean {
  const winningMoves = new Set<string>();
  for (const candidate of lineCandidates(board, originX, originY, direction, virtual)) {
    const nextVirtual = withStone(virtual, candidate.x, candidate.y, color);
    const line = exactFiveInDirection(board, candidate.x, candidate.y, color, direction, nextVirtual);
    if (line.length !== 5) continue;
    if (!containsPoint(line, originX, originY)) continue;
    if (hasOverlineAt(board, candidate.x, candidate.y, color, nextVirtual)) continue;
    winningMoves.add(pointKey(candidate.x, candidate.y));
  }
  return winningMoves.size >= 2;
}

// A three extension is ignored if that next black move would itself be forbidden.
function candidateIsLegalThreeExtension(board: Cell[][], x: number, y: number, color: StoneColor, virtual: VirtualStones): boolean {
  if (hasOverlineAt(board, x, y, color, virtual)) return false;
  if (countFourThreats(board, x, y, color, virtual) >= 2) return false;
  return countOpenThreeThreats(board, x, y, color, virtual, false) < 2;
}

// Counts rows where one legal next move can create an open four.
function countOpenThreeThreats(board: Cell[][], x: number, y: number, color: StoneColor, virtual: VirtualStones, validateExtensionLegality: boolean): number {
  const threats = new Set<string>();
  DIRECTIONS.forEach((direction, index) => {
    for (const candidate of lineCandidates(board, x, y, direction, virtual)) {
      const nextVirtual = withStone(virtual, candidate.x, candidate.y, color);
      if (!createsOpenFourInDirection(board, x, y, direction, color, nextVirtual)) continue;
      if (validateExtensionLegality && !candidateIsLegalThreeExtension(board, candidate.x, candidate.y, color, nextVirtual)) continue;
      threats.add(String(index));
    }
  });
  return threats.size;
}

export function analyzeRenjuMove(board: Cell[][], x: number, y: number, color: StoneColor): RenjuMoveAnalysis {
  const virtual = withStone(new Map(), x, y, color);
  const winningLine = color === "black" ? exactFiveLineAt(board, x, y, color, virtual) : checkRenjuWinWithVirtual(board, x, y, color, virtual).winningLine;
  const isOverline = color === "black" && hasOverlineAt(board, x, y, color, virtual);
  const openThreeCount = color === "black" ? countOpenThreeThreats(board, x, y, color, virtual, true) : 0;
  const fourCount = color === "black" ? countFourThreats(board, x, y, color, virtual) : 0;
  const reasons: ForbiddenReason[] = [];

  if (isOverline) reasons.push("overline");
  if (color === "black" && openThreeCount >= 2) reasons.push("doubleThree");
  if (color === "black" && fourCount >= 2) reasons.push("doubleFour");

  return {
    x,
    y,
    color,
    isFive: winningLine.length > 0,
    isOverline,
    openThreeCount,
    fourCount,
    forbidden: color === "black" && reasons.length > 0,
    reasons,
    winningLine
  };
}

// Shared win checker; virtual mode is used by analyzeRenjuMove before mutation.
function checkRenjuWinWithVirtual(board: Cell[][], x: number, y: number, color: StoneColor, virtual: VirtualStones): { isWin: boolean; winningLine: Array<{ x: number; y: number }> } {
  for (const direction of DIRECTIONS) {
    const line = lineRun(board, x, y, color, direction, virtual);
    if (color === "black" ? line.length === 5 : line.length >= 5) {
      return { isWin: true, winningLine: line };
    }
  }
  return { isWin: false, winningLine: [] };
}

export function checkRenjuWin(board: Cell[][], x: number, y: number, color: StoneColor): { isWin: boolean; winningLine: Array<{ x: number; y: number }> } {
  return checkRenjuWinWithVirtual(board, x, y, color, new Map());
}
