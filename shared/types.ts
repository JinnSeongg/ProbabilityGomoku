export type StoneColor = "black" | "white";
export type GameStatus = "waiting" | "cardSelecting" | "playing" | "finished";
export type CardCategory = "boost" | "disruption" | "information" | "draw" | "reroll" | "correction";
export type RuleSet = "standard" | "renju";
export type ForbiddenReason = "overline" | "doubleThree" | "doubleFour";

export interface Cell {
  x: number;
  y: number;
  stone: StoneColor | null;
  placedBy: string | null;
  placedTurn: number | null;
}

export interface ForbiddenPoint {
  x: number;
  y: number;
  color: StoneColor;
  reasons: ForbiddenReason[];
}

export interface RenjuMoveAnalysis {
  x: number;
  y: number;
  color: StoneColor;
  isFive: boolean;
  isOverline: boolean;
  openThreeCount: number;
  fourCount: number;
  forbidden: boolean;
  reasons: ForbiddenReason[];
  winningLine: Array<{ x: number; y: number }>;
}

export interface CardDefinition {
  id: string;
  name: string;
  category: CardCategory;
  effectType: string;
  value: number | null;
  duration: number | null;
  target: "self" | "opponent";
  description: string;
  requiresSelection: boolean;
  selectionType: "cell" | "card" | "none" | null;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
  ownerId: string;
  createdTurn: number;
}

export interface PlayerState {
  playerId: string;
  socketId: string;
  nickname: string;
  color: StoneColor;
  hand: CardInstance[];
  startCardCandidates: CardInstance[];
  selectedStartCards: CardInstance[];
  previousUsedCard: CardInstance | null;
  currentTurnUsedCard: CardInstance | null;
  pendingRecovery: PendingRecovery | null;
  pendingCardChoice: PendingCardChoice | null;
  badLuckStack: number;
  connected: boolean;
  ready: boolean;
}

export interface PendingRecovery {
  previousCardId: string | null;
  recoveryCardId: string;
}

export interface PendingCardChoice {
  choiceId: string;
  sourceCardId: string;
  options: CardInstance[];
  pickCount: number;
}

export interface Effect {
  effectId: string;
  sourceCardId: string;
  ownerPlayerId: string;
  targetPlayerId: string;
  effectType: "probabilityBuff" | "probabilityDebuff" | "insurance" | "retry" | "rage" | "balance" | "resistFate";
  value: number;
  remainingTurns: number;
  triggerTiming: "turnStart" | "beforePlace" | "afterPlace";
  stackable: boolean;
}

export interface Prediction {
  predictionId: string;
  playerId: string;
  x: number | null;
  y: number | null;
  resultColor: StoneColor;
  predictionType: "cell" | "currentStone";
  expiresAtTurnEnd: boolean;
}

export interface LogEntry {
  logId: string;
  turnNumber: number;
  type: "card" | "place" | "system" | "win";
  message: string;
  visibleTo: "all" | string;
  createdAt: string;
}

export interface GameState {
  roomId: string;
  status: GameStatus;
  ruleSet: RuleSet;
  boardSize: number;
  board: Cell[][];
  players: PlayerState[];
  currentTurnPlayerId: string | null;
  turnNumber: number;
  activeEffects: Effect[];
  privatePredictions: Prediction[];
  forbiddenPoints: ForbiddenPoint[];
  gameLog: LogEntry[];
  winnerPlayerId: string | null;
  winningLine: Array<{ x: number; y: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPlayerState {
  playerId: string;
  nickname: string;
  color: StoneColor;
  handCount: number;
  successProbability: number;
  badLuckStack: number;
  connected: boolean;
  ready: boolean;
  currentTurnUsedCardId: string | null;
}

export interface ClientGameView {
  roomId: string;
  status: GameStatus;
  ruleSet: RuleSet;
  boardSize: number;
  board: Cell[][];
  players: PublicPlayerState[];
  me: PlayerState;
  currentTurnPlayerId: string | null;
  turnNumber: number;
  activeEffects: Effect[];
  predictions: Prediction[];
  forbiddenPoints: ForbiddenPoint[];
  gameLog: LogEntry[];
  winnerPlayerId: string | null;
  winningLine: Array<{ x: number; y: number }>;
  currentProbability: ProbabilityResult | null;
}

export interface ProbabilityModifier {
  label: string;
  value: number;
}

export interface ProbabilityResult {
  selfColorProbability: number;
  opponentColorProbability: number;
  appliedModifiers: ProbabilityModifier[];
  guaranteed: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  playerId: string;
  nickname: string;
  message: string;
  createdAt: string;
}
