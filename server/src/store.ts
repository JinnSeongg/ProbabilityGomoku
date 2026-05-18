import type { ChatMessage, GameState } from "../../shared/types";

export class RoomStore {
  rooms = new Map<string, GameState>();
  socketToPlayer = new Map<string, string>();
  playerToRoom = new Map<string, string>();
  chats = new Map<string, ChatMessage[]>();

  findBySocket(socketId: string): { room: GameState; playerId: string } | null {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return null;
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return { room, playerId };
  }
}

export const store = new RoomStore();
