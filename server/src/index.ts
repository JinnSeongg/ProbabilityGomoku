import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { DEFAULT_BOARD_SIZE } from "../../shared/constants";
import type { ChatMessage, GameState } from "../../shared/types";
import { addLog, choosePendingCard, clientView, createRoom, joinRoom, maybeStartCardSelection, placeStone, removePlayerFromRoom, resetFinishedGame, selectStartCards, useCard } from "./game";
import { store } from "./store";
import { id } from "./utils";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: "/Gomoku/socket.io",
  cors: { origin: "*" }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  socket.on("createRoom", ({ nickname, boardSize = DEFAULT_BOARD_SIZE }: { nickname: string; boardSize?: number }, reply) => {
    try {
      const game = createRoom(nickname || "플레이어", socket.id, boardSize);
      const player = game.players[0];
      store.rooms.set(game.roomId, game);
      store.socketToPlayer.set(socket.id, player.playerId);
      store.playerToRoom.set(player.playerId, game.roomId);
      socket.join(game.roomId);
      reply?.({ ok: true, roomId: game.roomId, playerId: player.playerId });
      emitRoom(game.roomId);
    } catch (error) {
      reply?.({ ok: false, error: message(error) });
    }
  });

  socket.on("joinRoom", ({ roomId, nickname }: { roomId: string; nickname: string }, reply) => {
    try {
      const game = store.rooms.get(roomId?.toUpperCase());
      if (!game) throw new Error("방을 찾을 수 없습니다.");
      const player = joinRoom(game, nickname || "플레이어", socket.id);
      store.socketToPlayer.set(socket.id, player.playerId);
      store.playerToRoom.set(player.playerId, game.roomId);
      socket.join(game.roomId);
      reply?.({ ok: true, roomId: game.roomId, playerId: player.playerId });
      emitRoom(game.roomId);
    } catch (error) {
      reply?.({ ok: false, error: message(error) });
    }
  });

  socket.on("playerReady", (reply) => {
    mutate(socket.id, reply, ({ room, playerId }) => {
      const player = room.players.find((entry) => entry.playerId === playerId);
      if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
      player.ready = !player.ready;
      addLog(room, "system", `${player.nickname}님이 ${player.ready ? "준비 완료" : "준비 해제"} 상태입니다.`);
      maybeStartCardSelection(room);
    });
  });

  socket.on("selectStartCards", ({ instanceIds }: { instanceIds: string[] }, reply) => {
    mutate(socket.id, reply, ({ room, playerId }) => selectStartCards(room, playerId, instanceIds));
  });

  socket.on("useCard", ({ instanceId, cellTargets }: { instanceId: string; cellTargets?: Array<{ x: number; y: number }> }, reply) => {
    mutate(socket.id, reply, ({ room, playerId }) => useCard(room, playerId, instanceId, cellTargets ?? []));
  });

  socket.on("chooseCard", ({ instanceId }: { instanceId: string }, reply) => {
    mutate(socket.id, reply, ({ room, playerId }) => choosePendingCard(room, playerId, instanceId));
  });

  socket.on("placeStone", ({ x, y }: { x: number; y: number }, reply) => {
    mutate(socket.id, reply, ({ room, playerId }) => placeStone(room, playerId, x, y));
  });

  socket.on("resetGame", (reply) => {
    mutate(socket.id, reply, ({ room, playerId }) => resetFinishedGame(room, playerId));
  });

  socket.on("leaveRoom", (reply) => {
    try {
      const found = store.findBySocket(socket.id);
      if (!found) throw new Error("입장한 방이 없습니다.");
      const roomId = found.room.roomId;
      removePlayerFromRoom(found.room, found.playerId);
      store.socketToPlayer.delete(socket.id);
      store.playerToRoom.delete(found.playerId);
      socket.leave(roomId);
      reply?.({ ok: true });
      socket.emit("leftRoom");
      if (found.room.players.length === 0) {
        store.rooms.delete(roomId);
        store.chats.delete(roomId);
      } else {
        emitRoom(roomId);
      }
    } catch (error) {
      reply?.({ ok: false, error: message(error) });
    }
  });

  socket.on("sendChatMessage", ({ message }: { message: string }, reply) => {
    mutate(socket.id, reply, ({ room, playerId }) => {
      const player = room.players.find((entry) => entry.playerId === playerId);
      if (!player || !message.trim()) return;
      const chat: ChatMessage = { id: id("chat"), roomId: room.roomId, playerId, nickname: player.nickname, message: message.trim().slice(0, 240), createdAt: new Date().toISOString() };
      const list = store.chats.get(room.roomId) ?? [];
      list.push(chat);
      store.chats.set(room.roomId, list.slice(-80));
      io.to(room.roomId).emit("chatMessageReceived", chat);
    });
  });

  socket.on("disconnect", () => {
    const found = store.findBySocket(socket.id);
    if (!found) return;
    const player = found.room.players.find((entry) => entry.playerId === found.playerId);
    if (player) {
      player.connected = false;
      addLog(found.room, "system", `${player.nickname}님의 연결이 끊겼습니다.`);
      emitRoom(found.room.roomId);
    }
  });
});

function mutate(socketId: string, reply: ((payload: unknown) => void) | undefined, handler: (ctx: { room: GameState; playerId: string }) => void): void {
  try {
    const found = store.findBySocket(socketId);
    if (!found) throw new Error("입장한 방이 없습니다.");
    handler(found);
    reply?.({ ok: true });
    emitRoom(found.room.roomId);
  } catch (error) {
    reply?.({ ok: false, error: message(error) });
  }
}

function emitRoom(roomId: string): void {
  const room = store.rooms.get(roomId);
  if (!room) return;
  for (const player of room.players) {
    io.to(player.socketId).emit("roomStateUpdated", clientView(room, player.playerId));
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류입니다.";
}

const port = Number(process.env.PORT ?? 3001);

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`Probability Gomoku server listening on http://127.0.0.1:${port}`);
});


