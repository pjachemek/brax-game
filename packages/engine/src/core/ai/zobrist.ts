/**
 * Brax AI - Canonical position hashing (Zobrist).
 *
 * The Experience Book is keyed by position, so the key has to mean the same
 * thing next week, in another browser, and on the server. That rules out
 * `Math.random()` tables: they are regenerated on every page load, and a book
 * persisted under one table is noise under the next. The table here is
 * therefore derived from a fixed seed by a deterministic PRNG, which makes the
 * hash a stable, portable name for a position rather than a per-process id.
 *
 * Hashed: the piece (colour and side) standing on each of the 81 nodes, plus
 * the side to move. Deliberately not hashed: turn number, capture lists and
 * history — two positions that differ only in how they were reached are the
 * same position to play from, and sharing their statistics is the entire point.
 * `activeBrax` *is* folded in, because a standing declaration changes which
 * moves are legal and so which action statistics apply.
 */

import type { GameState, Piece } from '../types.ts';
import { BOARD_SIZE } from '../geometry.ts';

/** mulberry32: small, fast, and identical in every JS runtime. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NODE_COUNT = BOARD_SIZE * BOARD_SIZE;
/** RED/PLAIN, RED/MARKED, BLUE/PLAIN, BLUE/MARKED */
const PIECE_KINDS = 4;

/**
 * Two 32-bit halves per (node, piece kind). JavaScript bitwise operators are
 * 32-bit, so a 64-bit hash is carried as a pair and printed as 16 hex digits —
 * wide enough that collisions across a book of millions of positions stay
 * negligible.
 */
const TABLE_HI = new Uint32Array(NODE_COUNT * PIECE_KINDS);
const TABLE_LO = new Uint32Array(NODE_COUNT * PIECE_KINDS);

const rng = seededRandom(0x42524158); // "BRAX"
for (let i = 0; i < TABLE_HI.length; i++) {
  TABLE_HI[i] = (rng() * 0x100000000) >>> 0;
  TABLE_LO[i] = (rng() * 0x100000000) >>> 0;
}

const TURN_HI = (rng() * 0x100000000) >>> 0;
const TURN_LO = (rng() * 0x100000000) >>> 0;
const BRAX_HI = (rng() * 0x100000000) >>> 0;
const BRAX_LO = (rng() * 0x100000000) >>> 0;

function pieceKind(piece: Piece): number {
  const colorBit = piece.color === 'RED' ? 0 : 2;
  const sideBit = piece.side === 'MARKED' ? 1 : 0;
  return colorBit + sideBit;
}

function toHex(hi: number, lo: number): string {
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

/**
 * The canonical hash of a position: a 16-character hex string.
 *
 * Positions are *not* folded across colours or mirrored. The Brax board's
 * segment colouring is neither colour-symmetric nor mirror-symmetric — RED and
 * BLUE reach different ways out of the same node — so identifying a position
 * with its reflection would merge two genuinely different positions and teach
 * the bot from moves that are not legal in the one it is looking at.
 */
export function hashState(state: GameState): string {
  let hi = 0;
  let lo = 0;

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const piece = state.board[`${x},${y}`];
      if (!piece) continue;
      const index = (y * BOARD_SIZE + x) * PIECE_KINDS + pieceKind(piece);
      hi ^= TABLE_HI[index];
      lo ^= TABLE_LO[index];
    }
  }

  if (state.turn === 'BLUE') {
    hi ^= TURN_HI;
    lo ^= TURN_LO;
  }

  // A live declaration restricts the victim to a subset of their pieces, so a
  // position under Brax is a different position to choose a move in.
  if (state.activeBrax) {
    hi ^= BRAX_HI;
    lo ^= BRAX_LO;
    for (const pieceId of [...state.activeBrax.threatenedPieceIds].sort()) {
      for (let i = 0; i < pieceId.length; i++) {
        hi = (Math.imul(hi ^ pieceId.charCodeAt(i), 0x85ebca6b) ^ (hi >>> 13)) >>> 0;
        lo = (Math.imul(lo ^ pieceId.charCodeAt(i), 0xc2b2ae35) ^ (lo >>> 16)) >>> 0;
      }
    }
  }

  return toHex(hi, lo);
}
