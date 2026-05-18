import { CARD_DEFINITIONS } from "../../shared/cards";
import type { CardInstance, PlayerState } from "../../shared/types";

export function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function roomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

export function drawCard(ownerId: string, turnNumber: number): CardInstance {
  const card = CARD_DEFINITIONS[Math.floor(Math.random() * CARD_DEFINITIONS.length)];
  return { instanceId: id("card"), cardId: card.id, ownerId, createdTurn: turnNumber };
}

export function drawCards(ownerId: string, turnNumber: number, count: number): CardInstance[] {
  return Array.from({ length: count }, () => drawCard(ownerId, turnNumber));
}

export function removeCard(player: PlayerState, instanceId: string): CardInstance | null {
  const index = player.hand.findIndex((card) => card.instanceId === instanceId);
  if (index < 0) return null;
  return player.hand.splice(index, 1)[0];
}
