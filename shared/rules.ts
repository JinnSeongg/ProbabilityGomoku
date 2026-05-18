import { BASE_SELF_PROBABILITY, HAND_LIMIT, MAX_SELF_PROBABILITY, MIN_SELF_PROBABILITY, WIN_LENGTH } from "./constants";
import { CARD_BY_ID } from "./cards";
import type { CardInstance, Cell, Effect, GameState, PlayerState, ProbabilityResult, StoneColor } from "./types";

export function createBoard(size: number): Cell[][] {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => ({ x, y, stone: null, placedBy: null, placedTurn: null }))
  );
}

export function oppositeColor(color: StoneColor): StoneColor {
  return color === "black" ? "white" : "black";
}

export function calculateProbability(game: GameState, playerId: string, usedCard?: CardInstance | null): ProbabilityResult {
  const player = game.players.find((entry) => entry.playerId === playerId);
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");

  const modifiers = [{ label: "\uAE30\uBCF8 \uD655\uB960", value: BASE_SELF_PROBABILITY }];
  let chance = BASE_SELF_PROBABILITY;
  let guaranteed = false;

  for (const effect of game.activeEffects.filter((entry) => entry.targetPlayerId === playerId && entry.triggerTiming === "beforePlace")) {
    chance += effect.value;
    modifiers.push({ label: CARD_BY_ID.get(effect.sourceCardId)?.name ?? effect.effectType, value: effect.value });
  }

  if (player.badLuckStack > 0) {
    const stackBonus = Math.min(player.badLuckStack, 3) * 5;
    chance += stackBonus;
    modifiers.push({ label: "\uBD88\uC6B4 \uC2A4\uD0DD", value: stackBonus });
  }

  if (usedCard) {
    const card = CARD_BY_ID.get(usedCard.cardId);
    if (card?.effectType === "turnBoost" || card?.effectType === "accumulate") {
      chance += card.value ?? 0;
      modifiers.push({ label: card.name, value: card.value ?? 0 });
    }
    if (card?.effectType === "guarantee") {
      chance = 100;
      guaranteed = true;
      modifiers.push({ label: card.name, value: 100 });
    }
    if (card?.effectType === "largeSupply") {
      chance -= 10;
      modifiers.push({ label: card.name, value: -10 });
    }
    if (card?.effectType === "resistFate") {
      chance = 30;
      modifiers.push({ label: card.name, value: -50 });
    }
  }

  const selfColorProbability = guaranteed ? 100 : Math.max(MIN_SELF_PROBABILITY, Math.min(MAX_SELF_PROBABILITY, chance));
  return {
    selfColorProbability,
    opponentColorProbability: 100 - selfColorProbability,
    appliedModifiers: modifiers,
    guaranteed
  };
}

export function rollStoneColor(selfColor: StoneColor, probability: ProbabilityResult, random = Math.random()): StoneColor {
  return random * 100 < probability.selfColorProbability ? selfColor : oppositeColor(selfColor);
}

export function checkWin(board: Cell[][], x: number, y: number, color: StoneColor): { isWin: boolean; winningLine: Array<{ x: number; y: number }> } {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  for (const [dx, dy] of directions) {
    const line = [{ x, y }];
    for (const sign of [-1, 1]) {
      let nx = x + dx * sign;
      let ny = y + dy * sign;
      while (board[ny]?.[nx]?.stone === color) {
        line.push({ x: nx, y: ny });
        nx += dx * sign;
        ny += dy * sign;
      }
    }
    if (line.length >= WIN_LENGTH) {
      return { isWin: true, winningLine: line };
    }
  }

  return { isWin: false, winningLine: [] };
}

export function trimHand(player: PlayerState): void {
  if (player.hand.length > HAND_LIMIT) {
    player.hand.splice(0, player.hand.length - HAND_LIMIT);
  }
}

