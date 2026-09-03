import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

// 재접속 정책 (Phase 2): 서버 재시작·네트워크 끊김 후 400명이 동시에 재접속하면 입장 스파이크가 재현되므로
// 지수 백오프(1s → 2s → 4s … 최대 30s) + ±70% 지터로 재시도 시점을 흩뿌린다.
// socket.io-client 는 delay × 2^n 에 randomizationFactor 만큼의 지터를 곱해 다음 시도를 잡는다.
const RECONNECT = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30_000,
  randomizationFactor: 0.7,
  timeout: 20_000,
} as const;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ['websocket', 'polling'], ...RECONNECT });
  }
  return socket;
}
