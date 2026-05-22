import { CARD_BY_ID } from "../../shared/cards";
import { DEFAULT_BOARD_SIZE, START_CARD_CANDIDATES, START_CARD_SELECTION } from "../../shared/constants";
import { analyzeRenjuMove, checkRenjuWin } from "../../shared/renjuRules";
import { calculateProbability, checkWin, createBoard, rollStoneColor, trimHand } from "../../shared/rules";
import type { ClientGameView, Effect, GameState, LogEntry, PlayerState, Prediction, RuleSet, StoneColor } from "../../shared/types";
import { drawCard, drawCards, id, removeCard, roomCode } from "./utils";

export function createRoom(nickname: string, socketId: string, boardSize = DEFAULT_BOARD_SIZE, ruleSet: RuleSet = "renju"): GameState {
  const code = roomCode();
  const now = new Date().toISOString();
  const playerId = id("player");
  const player: PlayerState = {
    playerId,
    socketId,
    nickname,
    color: "black",
    hand: [],
    startCardCandidates: [],
    selectedStartCards: [],
    previousUsedCard: null,
    currentTurnUsedCard: null,
    pendingRecovery: null,
    pendingCardChoice: null,
    badLuckStack: 0,
    connected: true,
    ready: false
  };
  return {
    roomId: code,
    status: "waiting",
    ruleSet,
    boardSize,
    board: createBoard(boardSize),
    players: [player],
    currentTurnPlayerId: null,
    turnNumber: 1,
    activeEffects: [],
    privatePredictions: [],
    forbiddenPoints: [],
    gameLog: [log(1, "system", `${nickname}님이 방 ${code}을(를) 만들었습니다.`)],
    winnerPlayerId: null,
    winningLine: [],
    createdAt: now,
    updatedAt: now
  };
}

export function joinRoom(game: GameState, nickname: string, socketId: string): PlayerState {
  if (game.players.length >= 2) throw new Error("방이 가득 찼습니다.");
  const player: PlayerState = {
    playerId: id("player"),
    socketId,
    nickname,
    color: "white",
    hand: [],
    startCardCandidates: [],
    selectedStartCards: [],
    previousUsedCard: null,
    currentTurnUsedCard: null,
    pendingRecovery: null,
    pendingCardChoice: null,
    badLuckStack: 0,
    connected: true,
    ready: false
  };
  game.players.push(player);
  addLog(game, "system", `${nickname}님이 방에 입장했습니다.`);
  return player;
}

export function removePlayerFromRoom(game: GameState, playerId: string): string {
  const leaving = mustPlayer(game, playerId);
  game.players = game.players.filter((player) => player.playerId !== playerId);
  game.privatePredictions = game.privatePredictions.filter((entry) => entry.playerId !== playerId);
  game.activeEffects = game.activeEffects.filter((entry) => entry.ownerPlayerId !== playerId && entry.targetPlayerId !== playerId);

  if (game.players.length > 0) {
    game.status = "waiting";
    game.board = createBoard(game.boardSize);
    game.currentTurnPlayerId = null;
    game.turnNumber = 1;
    game.forbiddenPoints = [];
    game.winnerPlayerId = null;
    game.winningLine = [];
    for (const player of game.players) {
      player.color = "black";
      player.hand = [];
      player.startCardCandidates = [];
      player.selectedStartCards = [];
      player.previousUsedCard = null;
      player.currentTurnUsedCard = null;
      player.pendingRecovery = null;
      player.pendingCardChoice = null;
      player.badLuckStack = 0;
      player.ready = false;
    }
    addLog(game, "system", `${leaving.nickname}님이 방을 나갔습니다. 대기실로 돌아갑니다.`);
  }

  return leaving.nickname;
}

export function maybeStartCardSelection(game: GameState): void {
  if (game.players.length !== 2 || !game.players.every((player) => player.ready)) return;
  game.status = "cardSelecting";
  for (const player of game.players) {
    player.startCardCandidates = drawCards(player.playerId, game.turnNumber, START_CARD_CANDIDATES);
  }
  addLog(game, "system", "두 플레이어가 준비되었습니다. 시작 카드 3장을 선택하세요.");
}

export function selectStartCards(game: GameState, playerId: string, instanceIds: string[]): void {
  if (game.status !== "cardSelecting") throw new Error("지금은 시작 카드 선택 단계가 아닙니다.");
  if (instanceIds.length !== START_CARD_SELECTION) throw new Error("카드 3장을 선택해야 합니다.");
  const player = mustPlayer(game, playerId);
  const selected = instanceIds.map((instanceId) => {
    const card = player.startCardCandidates.find((entry) => entry.instanceId === instanceId);
    if (!card) throw new Error("올바르지 않은 시작 카드입니다.");
    return card;
  });
  player.selectedStartCards = selected;
  player.hand = [...selected];
  addLog(game, "system", `${player.nickname}님이 시작 카드를 확정했습니다.`);
  if (game.players.every((entry) => entry.selectedStartCards.length === START_CARD_SELECTION)) {
    game.status = "playing";
    game.currentTurnPlayerId = game.players.find((entry) => entry.color === "black")?.playerId ?? game.players[0].playerId;
    addLog(game, "system", "게임이 시작되었습니다. 흑이 선공입니다.");
  }
}

export function useCard(game: GameState, playerId: string, instanceId: string, cellTargets: Array<{ x: number; y: number }> = []): void {
  assertPlayingTurn(game, playerId);
  const player = mustPlayer(game, playerId);
  if (player.currentTurnUsedCard) throw new Error("이번 턴에는 이미 카드를 사용했습니다.");
  const cardInstance = removeCard(player, instanceId);
  if (!cardInstance) throw new Error("손패에 없는 카드입니다.");
  const definition = CARD_BY_ID.get(cardInstance.cardId);
  if (!definition) throw new Error("알 수 없는 카드입니다.");

  player.currentTurnUsedCard = cardInstance;
  game.privatePredictions = game.privatePredictions.filter((entry) => entry.playerId !== playerId);

  const opponent = game.players.find((entry) => entry.playerId !== playerId);
  const probability = calculateProbability(game, playerId, cardInstance);

  if (definition.effectType === "persistentBuff") addEffect(game, cardInstance.cardId, playerId, playerId, "probabilityBuff", definition.value ?? 0, definition.duration ?? 1);
  if (definition.effectType === "immersion") addEffect(game, cardInstance.cardId, playerId, playerId, "probabilityDebuff", -15, 1);
  if (definition.effectType === "persistentDebuff" && opponent) addEffect(game, cardInstance.cardId, playerId, opponent.playerId, "probabilityDebuff", definition.value ?? 0, definition.duration ?? 1);
  if (["nextDebuff", "balanceBreak", "headwind"].includes(definition.effectType) && opponent) {
    addEffect(game, cardInstance.cardId, playerId, opponent.playerId, "probabilityDebuff", definition.value ?? 0, 1);
    if (definition.effectType === "balanceBreak") opponent.hand.push(drawCard(opponent.playerId, game.turnNumber));
    trimHand(opponent);
  }
  if (["insurance", "retry", "rage", "balance", "resistFate"].includes(definition.effectType)) {
    addEffect(game, cardInstance.cardId, playerId, playerId, definition.effectType as Effect["effectType"], definition.value ?? 0, 1, "afterPlace");
  }
  if (definition.effectType === "recovery") player.pendingRecovery = { previousCardId: player.previousUsedCard?.cardId ?? null, recoveryCardId: cardInstance.cardId };
  if (definition.effectType === "draw") player.hand.push(drawCard(playerId, game.turnNumber));
  if (definition.effectType === "largeSupply") player.hand.push(...drawCards(playerId, game.turnNumber, 2));
  if (definition.effectType === "gambleSupply") {
    player.hand.push(drawCard(playerId, game.turnNumber));
    if (Math.random() < 0.3) player.hand.push(drawCard(playerId, game.turnNumber));
  }
  if (definition.effectType === "selectiveSupply") {
    player.pendingCardChoice = {
      choiceId: id("choice"),
      sourceCardId: cardInstance.cardId,
      options: drawCards(playerId, game.turnNumber, 3),
      pickCount: 1
    };
  }
  if (definition.effectType === "copy" && player.hand[0]) player.hand.push({ ...player.hand[0], instanceId: id("card"), createdTurn: game.turnNumber });
  if (definition.effectType === "maintenance") player.hand.push(drawCard(playerId, game.turnNumber));
  if (definition.effectType === "rerollOne" || definition.effectType === "exchange") {
    player.hand.shift();
    player.hand.push(drawCard(playerId, game.turnNumber));
  }
  if (definition.effectType === "rerollAll") {
    const count = player.hand.length;
    player.hand = drawCards(playerId, game.turnNumber, count);
  }
  if (definition.effectType === "currentStone") {
    game.privatePredictions.push(prediction(playerId, null, null, rollStoneColor(player.color, probability), "currentStone"));
  }
  if (["predictCells", "threePointScan", "safetyCheck", "removeUncertainty"].includes(definition.effectType)) {
    const limit = definition.value ?? 1;
    if (cellTargets.length < 1 || cellTargets.length > limit) throw new Error(`빈칸을 1개 이상 ${limit}개 이하로 선택하세요.`);
    for (const target of cellTargets) {
      const cell = game.board[target.y]?.[target.x];
      if (!cell || cell.stone) throw new Error("정보 확인 대상은 빈칸이어야 합니다.");
      const color = rollStoneColor(player.color, probability);
      if (definition.effectType !== "removeUncertainty" || color === player.color) {
        game.privatePredictions.push(prediction(playerId, target.x, target.y, color, "cell"));
      }
      if (definition.effectType === "safetyCheck" && color !== player.color) player.hand.push(drawCard(playerId, game.turnNumber));
    }
  }
  trimHand(player);
  addLog(game, "card", `${player.nickname}님이 ${definition.name} 카드를 사용했습니다.`);
}

export function placeStone(game: GameState, playerId: string, x: number, y: number): void {
  assertPlayingTurn(game, playerId);
  const player = mustPlayer(game, playerId);
  const cell = game.board[y]?.[x];
  if (!cell || cell.stone) throw new Error("보드의 빈칸을 선택하세요.");

  const stored = game.privatePredictions.find((entry) => entry.playerId === playerId && ((entry.predictionType === "cell" && entry.x === x && entry.y === y) || entry.predictionType === "currentStone"));
  const probability = calculateProbability(game, playerId, player.currentTurnUsedCard);
  const color: StoneColor = stored?.resultColor ?? rollStoneColor(player.color, probability);

  if (game.ruleSet === "renju" && player.color === "black") {
    const analysis = analyzeRenjuMove(game.board, x, y, "black");
    if (analysis.forbidden) {
      throw new Error(`렌주 금수입니다: ${analysis.reasons.join(", ")}`);
    }
  }

  cell.stone = color;
  cell.placedBy = playerId;
  cell.placedTurn = game.turnNumber;

  const success = color === player.color;
  player.badLuckStack = success ? 0 : Math.min(3, player.badLuckStack + 1);
  resolveAfterPlaceEffects(game, player, success);

  const win = game.ruleSet === "renju" ? checkRenjuWin(game.board, x, y, color) : checkWin(game.board, x, y, color);
  addLog(
    game,
    "place",
    `${player.nickname}님이 ${color === "black" ? "흑" : "백"}돌을 ${x + 1}, ${y + 1}에 놓았습니다. ${success ? "성공" : "실패"} (내 색 확률 ${probability.selfColorProbability}%)`
  );
  if (win.isWin) {
    const winner = game.players.find((entry) => entry.color === color);
    game.status = "finished";
    game.winnerPlayerId = winner?.playerId ?? null;
    game.winningLine = win.winningLine;
    addLog(game, "win", `${winner?.nickname ?? (color === "black" ? "흑" : "백")} 승리. 5목이 완성되었습니다.`);
    return;
  }

  player.previousUsedCard = player.currentTurnUsedCard;
  player.currentTurnUsedCard = null;
  game.privatePredictions = game.privatePredictions.filter((entry) => entry.playerId !== playerId);
  decrementEffects(game, playerId);
  const next = game.players.find((entry) => entry.playerId !== playerId);
  game.currentTurnPlayerId = next?.playerId ?? playerId;
  game.turnNumber += 1;
  handleTurnStart(game, game.currentTurnPlayerId);
}

export function resetFinishedGame(game: GameState, playerId: string): void {
  if (game.status !== "finished") throw new Error("종료된 게임만 초기화할 수 있습니다.");
  mustPlayer(game, playerId);
  game.status = "waiting";
  game.board = createBoard(game.boardSize);
  game.currentTurnPlayerId = null;
  game.turnNumber = 1;
  game.activeEffects = [];
  game.privatePredictions = [];
  game.forbiddenPoints = [];
  game.winnerPlayerId = null;
  game.winningLine = [];
  for (const player of game.players) {
    player.hand = [];
    player.startCardCandidates = [];
    player.selectedStartCards = [];
    player.previousUsedCard = null;
    player.currentTurnUsedCard = null;
    player.pendingRecovery = null;
    player.pendingCardChoice = null;
    player.badLuckStack = 0;
    player.ready = false;
  }
  game.gameLog = [log(1, "system", "게임이 초기화되었습니다. 두 플레이어가 다시 대기실로 돌아왔습니다.")];
  game.updatedAt = new Date().toISOString();
}

export function choosePendingCard(game: GameState, playerId: string, instanceId: string): void {
  const player = mustPlayer(game, playerId);
  const pending = player.pendingCardChoice;
  if (!pending) throw new Error("선택할 카드 후보가 없습니다.");
  const selected = pending.options.find((card) => card.instanceId === instanceId);
  if (!selected) throw new Error("올바르지 않은 카드 후보입니다.");
  player.hand.push(selected);
  player.pendingCardChoice = null;
  trimHand(player);
  addLog(game, "card", `${player.nickname}님이 ${CARD_BY_ID.get(selected.cardId)?.name ?? "카드"}을(를) 선택했습니다.`, playerId);
}

export function clientView(game: GameState, playerId: string): ClientGameView {
  const me = mustPlayer(game, playerId);
  return {
    roomId: game.roomId,
    status: game.status,
    ruleSet: game.ruleSet,
    boardSize: game.boardSize,
    board: game.board,
    players: game.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      color: player.color,
      handCount: player.hand.length,
      successProbability: game.status === "playing" ? calculateProbability(game, player.playerId, player.currentTurnUsedCard).selfColorProbability : 0,
      badLuckStack: player.badLuckStack,
      connected: player.connected,
      ready: player.ready,
      currentTurnUsedCardId: player.currentTurnUsedCard?.cardId ?? null
    })),
    me,
    currentTurnPlayerId: game.currentTurnPlayerId,
    turnNumber: game.turnNumber,
    activeEffects: game.activeEffects.filter((entry) => entry.targetPlayerId === playerId || entry.ownerPlayerId === playerId),
    predictions: game.privatePredictions.filter((entry) => entry.playerId === playerId),
    forbiddenPoints: game.forbiddenPoints,
    gameLog: game.gameLog.filter((entry) => entry.visibleTo === "all" || entry.visibleTo === playerId).slice(-40),
    winnerPlayerId: game.winnerPlayerId,
    winningLine: game.winningLine,
    currentProbability: game.status === "playing" ? calculateProbability(game, playerId, me.currentTurnUsedCard) : null
  };
}

export function addLog(game: GameState, type: LogEntry["type"], message: string, visibleTo: "all" | string = "all"): void {
  game.gameLog.push(log(game.turnNumber, type, message, visibleTo));
  game.updatedAt = new Date().toISOString();
}

function log(turnNumber: number, type: LogEntry["type"], message: string, visibleTo: "all" | string = "all"): LogEntry {
  return { logId: id("log"), turnNumber, type, message, visibleTo, createdAt: new Date().toISOString() };
}

function prediction(playerId: string, x: number | null, y: number | null, resultColor: StoneColor, predictionType: Prediction["predictionType"]): Prediction {
  return { predictionId: id("prediction"), playerId, x, y, resultColor, predictionType, expiresAtTurnEnd: true };
}

function mustPlayer(game: GameState, playerId: string): PlayerState {
  const player = game.players.find((entry) => entry.playerId === playerId);
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  return player;
}

function assertPlayingTurn(game: GameState, playerId: string): void {
  if (game.status !== "playing") throw new Error("게임 진행 중이 아닙니다.");
  if (game.currentTurnPlayerId !== playerId) throw new Error("내 턴이 아닙니다.");
}

function addEffect(game: GameState, cardId: string, ownerId: string, targetId: string, type: Effect["effectType"], value: number, duration: number, timing: Effect["triggerTiming"] = "beforePlace"): void {
  const existing = game.activeEffects.find((entry) => !entry.stackable && entry.sourceCardId === cardId && entry.targetPlayerId === targetId);
  if (existing) {
    existing.remainingTurns = duration;
    existing.value = value;
    return;
  }
  game.activeEffects.push({ effectId: id("effect"), sourceCardId: cardId, ownerPlayerId: ownerId, targetPlayerId: targetId, effectType: type, value, remainingTurns: duration, triggerTiming: timing, stackable: false });
}

function decrementEffects(game: GameState, playerId: string): void {
  for (const effect of game.activeEffects.filter((entry) => entry.targetPlayerId === playerId && entry.triggerTiming === "beforePlace")) {
    effect.remainingTurns -= 1;
  }
  game.activeEffects = game.activeEffects.filter((entry) => entry.remainingTurns > 0);
}

function resolveAfterPlaceEffects(game: GameState, player: PlayerState, success: boolean): void {
  const effects = game.activeEffects.filter((entry) => entry.targetPlayerId === player.playerId && entry.triggerTiming === "afterPlace");
  const opponent = game.players.find((entry) => entry.playerId !== player.playerId);
  for (const effect of effects) {
    if (success && effect.effectType === "resistFate") player.hand.push(...drawCards(player.playerId, game.turnNumber, 2));
    if (!success && effect.effectType === "insurance") player.hand.push(drawCard(player.playerId, game.turnNumber));
    if (!success && effect.effectType === "retry") addEffect(game, effect.sourceCardId, player.playerId, player.playerId, "probabilityBuff", 20, 1);
    if (!success && effect.effectType === "rage" && opponent) addEffect(game, effect.sourceCardId, player.playerId, opponent.playerId, "probabilityDebuff", -20, 1);
    if (!success && effect.effectType === "balance") {
      player.hand.shift();
      player.hand.push(drawCard(player.playerId, game.turnNumber));
    }
    if (!success && effect.effectType === "resistFate") addEffect(game, effect.sourceCardId, player.playerId, player.playerId, "probabilityBuff", 30, 1);
  }
  game.activeEffects = game.activeEffects.filter((entry) => !(entry.targetPlayerId === player.playerId && entry.triggerTiming === "afterPlace"));
  trimHand(player);
}

function handleTurnStart(game: GameState, playerId: string | null): void {
  if (!playerId) return;
  const player = mustPlayer(game, playerId);
  if (player.pendingRecovery && Math.random() < 0.4) {
    if (player.pendingRecovery.previousCardId) player.hand.push({ instanceId: id("card"), cardId: player.pendingRecovery.previousCardId, ownerId: playerId, createdTurn: game.turnNumber });
    player.hand.push({ instanceId: id("card"), cardId: player.pendingRecovery.recoveryCardId, ownerId: playerId, createdTurn: game.turnNumber });
    trimHand(player);
  }
  player.pendingRecovery = null;
  addLog(game, "system", `${player.nickname}님의 턴이 시작되었습니다.`);
}

