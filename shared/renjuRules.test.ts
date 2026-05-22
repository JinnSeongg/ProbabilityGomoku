import assert from "node:assert/strict";
import test from "node:test";
import { placeStone, createRoom } from "../server/src/game";
import { checkRenjuWin, analyzeRenjuMove } from "./renjuRules";
import { createBoard } from "./rules";
import type { Cell, StoneColor } from "./types";

function put(board: Cell[][], x: number, y: number, stone: StoneColor): void {
  board[y][x].stone = stone;
  board[y][x].placedBy = "setup";
  board[y][x].placedTurn = 0;
}

test("black exact five is a legal renju win", () => {
  const board = createBoard(15);
  [3, 4, 5, 6].forEach((x) => put(board, x, 7, "black"));

  const analysis = analyzeRenjuMove(board, 7, 7, "black");
  assert.equal(analysis.forbidden, false);
  assert.equal(analysis.isFive, true);

  put(board, 7, 7, "black");
  assert.equal(checkRenjuWin(board, 7, 7, "black").isWin, true);
});

test("black overline is forbidden and not a renju win", () => {
  const board = createBoard(15);
  [2, 3, 4, 5, 6].forEach((x) => put(board, x, 7, "black"));

  const analysis = analyzeRenjuMove(board, 7, 7, "black");
  assert.equal(analysis.forbidden, true);
  assert.ok(analysis.reasons.includes("overline"));

  put(board, 7, 7, "black");
  assert.equal(checkRenjuWin(board, 7, 7, "black").isWin, false);
});

test("white overline is a win and never forbidden", () => {
  const board = createBoard(15);
  [2, 3, 4, 5, 6].forEach((x) => put(board, x, 7, "white"));

  const analysis = analyzeRenjuMove(board, 7, 7, "white");
  assert.equal(analysis.forbidden, false);

  put(board, 7, 7, "white");
  assert.equal(checkRenjuWin(board, 7, 7, "white").isWin, true);
});

test("black double three is forbidden when two open threes are created", () => {
  const board = createBoard(15);
  put(board, 6, 7, "black");
  put(board, 8, 7, "black");
  put(board, 7, 6, "black");
  put(board, 7, 8, "black");

  const analysis = analyzeRenjuMove(board, 7, 7, "black");
  assert.equal(analysis.forbidden, true);
  assert.ok(analysis.reasons.includes("doubleThree"));
  assert.ok(analysis.openThreeCount >= 2);
});

test("black double four is forbidden when two four threats are created", () => {
  const board = createBoard(15);
  [4, 5, 6].forEach((x) => put(board, x, 7, "black"));
  [4, 5, 6].forEach((y) => put(board, 7, y, "black"));

  const analysis = analyzeRenjuMove(board, 7, 7, "black");
  assert.equal(analysis.forbidden, true);
  assert.ok(analysis.reasons.includes("doubleFour"));
  assert.ok(analysis.fourCount >= 2);
});

test("blocked three is not counted as an open three", () => {
  const board = createBoard(15);
  put(board, 4, 7, "white");
  put(board, 5, 7, "black");
  put(board, 6, 7, "black");

  const analysis = analyzeRenjuMove(board, 7, 7, "black");
  assert.equal(analysis.openThreeCount, 0);
  assert.equal(analysis.reasons.includes("doubleThree"), false);
});

test("four that can only be completed as overline is not counted as a four threat", () => {
  const board = createBoard(15);
  [3, 4, 5, 6].forEach((x) => put(board, x, 7, "black"));
  [4, 5, 6].forEach((y) => put(board, 7, y, "black"));

  const analysis = analyzeRenjuMove(board, 7, 7, "black");
  assert.equal(analysis.fourCount, 1);
  assert.equal(analysis.reasons.includes("doubleFour"), false);
});

test("forbidden placeStone leaves server state unchanged", () => {
  const game = createRoom("tester", "socket-1", 15, "renju");
  const player = game.players[0];
  game.status = "playing";
  game.currentTurnPlayerId = player.playerId;
  [2, 3, 4, 5, 6].forEach((x) => put(game.board, x, 7, "black"));

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.throws(() => placeStone(game, player.playerId, 7, 7), /렌주 금수입니다/);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(game.board[7][7].stone, null);
  assert.equal(game.board[7][7].placedBy, null);
  assert.equal(game.board[7][7].placedTurn, null);
  assert.equal(game.turnNumber, 1);
  assert.equal(game.winnerPlayerId, null);
  assert.deepEqual(game.winningLine, []);
});

test("black player's forbidden click is rejected even when the actual stone would be white", () => {
  const game = createRoom("tester", "socket-1", 15, "renju");
  const player = game.players[0];
  game.status = "playing";
  game.currentTurnPlayerId = player.playerId;
  [2, 3, 4, 5, 6].forEach((x) => put(game.board, x, 7, "black"));
  game.privatePredictions.push({
    predictionId: "prediction-white-current",
    playerId: player.playerId,
    x: null,
    y: null,
    resultColor: "white",
    predictionType: "currentStone",
    expiresAtTurnEnd: true
  });

  assert.throws(() => placeStone(game, player.playerId, 7, 7), /렌주 금수입니다/);
  assert.equal(game.board[7][7].stone, null);
  assert.equal(game.turnNumber, 1);
  assert.equal(game.winnerPlayerId, null);
  assert.deepEqual(game.winningLine, []);
});
