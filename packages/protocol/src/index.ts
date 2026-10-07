/**
 * @harvest/protocol: WebSocket message types shared by client and server.
 *
 * Status: types only. zod schemas (runtime validation) arrive in M3 (SRV-04).
 * Spec: docs/03-architecture/realtime-protocol.md
 */

import type { SimEvent } from '@harvest/sim';

export const PROTOCOL_VERSION = 1;

export type Envelope<T extends string, D> = { v: typeof PROTOCOL_VERSION; t: T; id?: string; d: D };

export type Mode = 'casual' | 'ranked';
export type Phase = 'lobby' | 'coding' | 'locking' | 'executing' | 'finale' | 'results';

export type Loadout = {
  droneBody?: string;
  dronePaint?: string;
  droneTrail?: string;
  avatar?: { head?: string; hat?: string; outfit?: string; accessory?: string };
  backdrop?: string;
  siloSkin?: string;
  emoteSet?: string;
};

export type RoomSettings = {
  gridSize: 6 | 8 | 10;
  codingSeconds: 300 | 600 | 900;
  maxPlayers: number; // 2..8
  modifiers: readonly ('rocky' | 'weather' | 'golf')[];
  botSlots: number;
};

export type RoomPlayer = {
  slot: number;
  userId: string;
  name: string;
  level: number;
  rankIndex?: number;
  loadout: Loadout;
  ready: boolean;
  connected: boolean;
  lockedIn: boolean;
  isBot: boolean;
};

export type RoomState = {
  roomId: string;
  code: string | null;
  type: 'matchmade-casual' | 'matchmade-ranked' | 'custom-public' | 'custom-private' | 'practice';
  hostUserId: string | null;
  settings: RoomSettings;
  phase: Phase;
  deadline: number | null;
  players: RoomPlayer[];
  seed?: number;
  rulesVersion: string;
};

// ---------- Client → Server ----------

export type ClientMessage =
  | Envelope<'queue.join', { mode: Mode }>
  | Envelope<'queue.leave', Record<string, never>>
  | Envelope<'ready.accept', { readyCheckId: string }>
  | Envelope<'ready.decline', { readyCheckId: string }>
  | Envelope<'room.create', { settings: RoomSettings; visibility: 'public' | 'private'; name?: string }>
  | Envelope<'room.join', { code: string } | { roomId: string }>
  | Envelope<'room.leave', Record<string, never>>
  | Envelope<'room.ready', { ready: boolean }>
  | Envelope<'room.start', Record<string, never>>
  | Envelope<'room.kick', { userId: string }>
  | Envelope<'program.draft', { source: string; rev: number }>
  | Envelope<'program.lockIn', { source: string; rev: number }>
  | Envelope<'finale.ack', Record<string, never>>
  | Envelope<'rematch.vote', { yes: boolean }>
  | Envelope<'emote', { emoteId: string }>
  | Envelope<'presence.set', { status: 'online' | 'away' | 'invisible' }>;

// ---------- Server → Client ----------

export type ServerMessage =
  | Envelope<'hello', { userId: string; serverNow: number; protocol: number; resume?: unknown }>
  | Envelope<
      'queue.status',
      { mode: Mode; searchingSince: number; estimatedWaitSec: number; playersInQueue: number }
    >
  | Envelope<'ready.check', { readyCheckId: string; acceptBy: number; players: number }>
  | Envelope<'ready.update', { accepted: number; total: number }>
  | Envelope<
      'ready.failed',
      {
        reason: 'you_declined' | 'you_timed_out' | 'other_declined';
        requeued: boolean;
        cooldownUntil?: number;
      }
    >
  | Envelope<'room.state', RoomState>
  | Envelope<'room.patch', Partial<RoomState>>
  | Envelope<'phase', { phase: Phase; deadline?: number; serverNow: number }>
  | Envelope<
      'match.preview',
      { seed: number; rulesVersion: string; languageVersion: string; grid: number; startCredits: number }
    >
  | Envelope<'match.events', { chunk: number; of: number; events: SimEvent[] }>
  | Envelope<'match.results', unknown>
  | Envelope<'presence.update', { userId: string; status: string; activity?: string }>
  | Envelope<'emote', { fromSlot: number; emoteId: string }>
  | Envelope<'error', { code: string; message: string; ref?: string }>
  | Envelope<'session.replaced', Record<string, never>>;
