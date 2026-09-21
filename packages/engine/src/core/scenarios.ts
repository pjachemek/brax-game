/**
 * Brax Rules Engine - Interactive Scenarios & Test Presets
 * Pre-configured board setups allowing instant visual verification of Brax mechanics.
 */

import { GameState, Piece } from './types.ts';
import { BOARD_SIZE } from './geometry.ts';

export interface GameScenario {
  id: string;
  title: string;
  badge: string;
  description: string;
  hint: string;
  state: GameState;
}

function emptyBoard(): Record<string, Piece | null> {
  const board: Record<string, Piece | null> = {};
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      board[`${x},${y}`] = null;
    }
  }
  return board;
}

export function getPresetScenarios(): GameScenario[] {
  return [
    {
      id: 'scenario_90deg_turn',
      title: '1. Ruch o 2 z zakrętem 90°',
      badge: 'Zasada 1',
      description:
        'Pionek RED na B1 (1,0) może wykonać ruch o 2 wzdłuż swoich czerwonych linii z zakrętem 90°: B1 -> B2 -> C2 (1,0 -> 1,1 -> 2,1).',
      hint: 'Kliknij czerwony pionek R1 na B1, a następnie zielone podświetlenie na polu C2.',
      state: {
        board: {
          ...emptyBoard(),
          '1,0': { id: 'R1', color: 'RED', side: 'PLAIN' },
          '4,8': { id: 'B1', color: 'BLUE', side: 'PLAIN' },
        },
        turn: 'RED',
        turnNumber: 1,
        capturedPieces: { RED: [], BLUE: [] },
        activeBrax: null,
        lastBraxCallTurn: { RED: null, BLUE: null },
        history: [],
        result: null,
        gameModeId: 'two_player',
        endgame1v1HalfMovesWithoutCapture: 0,
      },
    },
    {
      id: 'scenario_blocked_jump',
      title: '2. Zakaz przeskakiwania własnego pionka (P1 zajęte)',
      badge: 'Zasada 2',
      description:
        'Węzeł pośredni B2 (1,1) jest zajęty przez WŁASNY pionek OBSTACLE. Ruch o 2 do C2 jest zablokowany – własnych pionków nie wolno przeskakiwać (wrogi pionek na B2 zostałby zbity po drodze).',
      hint: 'Kliknij czerwony pionek R1 na B1. Zauważ, że pole C2 NIE jest dostępne jako ruch o 2!',
      state: {
        board: {
          ...emptyBoard(),
          '1,0': { id: 'R1', color: 'RED', side: 'PLAIN' },
          '1,1': { id: 'OBSTACLE', color: 'RED', side: 'PLAIN' },
          '7,8': { id: 'B2', color: 'BLUE', side: 'PLAIN' },
        },
        turn: 'RED',
        turnNumber: 1,
        capturedPieces: { RED: [], BLUE: [] },
        activeBrax: null,
        lastBraxCallTurn: { RED: null, BLUE: null },
        history: [],
        result: null,
        gameModeId: 'two_player',
        endgame1v1HalfMovesWithoutCapture: 0,
      },
    },
    {
      id: 'scenario_brax_enforcement',
      title: '3. Przymus ruchu po zawołaniu Brax',
      badge: 'Zasada 3',
      description:
        'Gracz RED zawołał „Brax!” po zagrożeniu pionka B1 na D2. Tura gracza BLUE: gracz BLUE MOŻE poruszyć TYLKO zagrożony pionek B1. Pionek B2 na H8 jest zablokowany.',
      hint: 'Spróbuj kliknąć bezpieczny pionek B2 – zobaczysz informację o zakazie. Następnie kliknij zagrożony pionek B1.',
      state: {
        board: {
          ...emptyBoard(),
          '3,0': { id: 'R2', color: 'RED', side: 'PLAIN' },
          '3,1': { id: 'B1', color: 'BLUE', side: 'PLAIN' },
          '7,7': { id: 'B2', color: 'BLUE', side: 'PLAIN' },
        },
        turn: 'BLUE',
        turnNumber: 2,
        capturedPieces: { RED: [], BLUE: [] },
        activeBrax: {
          callerColor: 'RED',
          victimColor: 'BLUE',
          threatenedPieceIds: ['B1'],
          enforcedAtTurnNumber: 1,
        },
        lastBraxCallTurn: { RED: 1, BLUE: null },
        history: [
          {
            moveNumber: 1,
            player: 'RED',
            pieceId: 'R2',
            from: { x: 2, y: 0 },
            to: { x: 3, y: 0 },
            distance: 1,
            calledBrax: true,
            algebraic: 'C1-D1 (Brax!)',
            timestamp: Date.now() - 10000,
          },
        ],
        result: null,
        gameModeId: 'two_player',
        endgame1v1HalfMovesWithoutCapture: 0,
      },
    },
    {
      id: 'scenario_capture_p2',
      title: '4. Bicie na węźle docelowym P2',
      badge: 'Zasada 4',
      description:
        'Pionek RED na B1 (1,0) wykonuje ruch o 2 do C2 (2,1), gdzie stoi niebieski pionek ENEMY_B. Czerwony zbija niebieskiego!',
      hint: 'Kliknij pionek R1 na B1, a następnie kliknij wrogiego pionka na C2, aby wykonać bicie o dystansie 2.',
      state: {
        board: {
          ...emptyBoard(),
          '1,0': { id: 'R1', color: 'RED', side: 'PLAIN' },
          '2,1': { id: 'ENEMY_B', color: 'BLUE', side: 'PLAIN' },
          '7,8': { id: 'B2', color: 'BLUE', side: 'PLAIN' },
        },
        turn: 'RED',
        turnNumber: 1,
        capturedPieces: { RED: [], BLUE: [] },
        activeBrax: null,
        lastBraxCallTurn: { RED: null, BLUE: null },
        history: [],
        result: null,
        gameModeId: 'two_player',
        endgame1v1HalfMovesWithoutCapture: 0,
      },
    },
    {
      id: 'scenario_double_capture',
      title: '4b. Podwójne bicie jednym ruchem',
      badge: 'Zasada 4',
      description:
        'Pionek RED na B1 (1,0) wykonuje ruch o 2 po swoich liniach przez B2 (1,1) na A2 (0,1). Na obu polach stoją pionki BLUE – oba zostają zbite w jednej turze.',
      hint: 'Kliknij pionek R1 na B1, a następnie pole A2. Oba niebieskie pionki znikną z planszy.',
      state: {
        board: {
          ...emptyBoard(),
          '1,0': { id: 'R1', color: 'RED', side: 'PLAIN' },
          '1,1': { id: 'MID_B', color: 'BLUE', side: 'PLAIN' },
          '0,1': { id: 'DEST_B', color: 'BLUE', side: 'PLAIN' },
          '7,8': { id: 'B2', color: 'BLUE', side: 'PLAIN' },
        },
        turn: 'RED',
        turnNumber: 1,
        capturedPieces: { RED: [], BLUE: [] },
        activeBrax: null,
        lastBraxCallTurn: { RED: null, BLUE: null },
        history: [],
        result: null,
        gameModeId: 'two_player',
        endgame1v1HalfMovesWithoutCapture: 0,
      },
    },
    {
      id: 'scenario_endgame_2v1',
      title: '5. Końcówka 2:1 (Prawo do Brax wygasło)',
      badge: 'Końcówka',
      description:
        'Na planszy zostały 2 pionki RED i 1 pionek BLUE. Zgodnie z regułą Brax, prawo do wołania Brax wygasło bezpowrotnie dla obu stron.',
      hint: 'Nawet jeśli wykonasz ruch grożący biciem, przycisk Brax pozostanie niedostępny z powodu stanu 2:1.',
      state: {
        board: {
          ...emptyBoard(),
          '1,0': { id: 'R1', color: 'RED', side: 'PLAIN' },
          '7,0': { id: 'R2', color: 'RED', side: 'PLAIN' },
          '2,1': { id: 'B1', color: 'BLUE', side: 'PLAIN' },
        },
        turn: 'RED',
        turnNumber: 1,
        capturedPieces: {
          RED: [
            { id: 'B2', color: 'BLUE', side: 'PLAIN' },
            { id: 'B3', color: 'BLUE', side: 'PLAIN' },
            { id: 'B4', color: 'BLUE', side: 'PLAIN' },
            { id: 'B5', color: 'BLUE', side: 'PLAIN' },
            { id: 'B6', color: 'BLUE', side: 'PLAIN' },
            { id: 'B7', color: 'BLUE', side: 'PLAIN' },
          ],
          BLUE: [
            { id: 'R3', color: 'RED', side: 'PLAIN' },
            { id: 'R4', color: 'RED', side: 'PLAIN' },
            { id: 'R5', color: 'RED', side: 'PLAIN' },
            { id: 'R6', color: 'RED', side: 'PLAIN' },
            { id: 'R7', color: 'RED', side: 'PLAIN' },
          ],
        },
        activeBrax: null,
        lastBraxCallTurn: { RED: null, BLUE: null },
        history: [],
        result: null,
        gameModeId: 'two_player',
        endgame1v1HalfMovesWithoutCapture: 0,
      },
    },
  ];
}
