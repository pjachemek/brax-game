/**
 * @re-checkers/engine-client - In-process adapter.
 *
 * Runs the real session manager inside the app. Keeps offline play working and
 * keeps tests free of a network, while going through the exact same async
 * contract as the hosted service so the two stay behaviourally interchangeable.
 */

import {
  GameSessionManager,
  type AIDifficulty,
  type CreateGameOptions,
  type GameModeInfo,
  type GameSnapshot,
  type GameState,
  type MoveAction,
  type MoveHistoryItem,
  type MoveOptionsResult,
  type MoveOutcome,
  type NodeCoord,
  type PlayerColor,
  type SessionManagerOptions,
  type ThreatenedPieceInfo,
  type TurnContextResult,
  type ValidationResult,
} from '@re-checkers/engine';

import type { ApplyMoveRequestOptions, ReCheckersEngineClient } from './types.ts';

export class LocalEngineClient implements ReCheckersEngineClient {
  public readonly transport = 'local' as const;

  private readonly manager: GameSessionManager;

  constructor(managerOrOptions: GameSessionManager | SessionManagerOptions = {}) {
    this.manager =
      managerOrOptions instanceof GameSessionManager
        ? managerOrOptions
        : new GameSessionManager(managerOrOptions);
  }

  public async listModes(): Promise<GameModeInfo[]> {
    return this.manager.listModes();
  }

  public createGame(options: CreateGameOptions = {}): Promise<GameSnapshot> {
    return this.manager.createGame(options);
  }

  public getGame(gameId: string): Promise<GameSnapshot> {
    return this.manager.getGame(gameId);
  }

  public deleteGame(gameId: string): Promise<void> {
    return this.manager.deleteGame(gameId);
  }

  public resetGame(gameId: string, modeId?: string): Promise<GameSnapshot> {
    return this.manager.resetGame(gameId, modeId);
  }

  public loadState(gameId: string, state: GameState): Promise<GameSnapshot> {
    return this.manager.loadState(gameId, state);
  }

  public getValidMoves(gameId: string, pieceId: string): Promise<MoveAction[]> {
    return this.manager.getValidMoves(gameId, pieceId);
  }

  public getAllValidMoves(gameId: string): Promise<MoveAction[]> {
    return this.manager.getAllValidMoves(gameId);
  }

  public getMoveOptions(
    gameId: string,
    pieceId: string,
    to: NodeCoord
  ): Promise<MoveOptionsResult> {
    return this.manager.getMoveOptions(gameId, pieceId, to);
  }

  public getThreats(gameId: string, attackerColor?: PlayerColor): Promise<ThreatenedPieceInfo[]> {
    return this.manager.getThreats(gameId, attackerColor);
  }

  public getTurnContext(gameId: string): Promise<TurnContextResult> {
    return this.manager.getTurnContext(gameId);
  }

  public validateMove(gameId: string, move: MoveAction): Promise<ValidationResult> {
    return this.manager.validateMove(gameId, move);
  }

  public applyMove(
    gameId: string,
    move: MoveAction,
    options: ApplyMoveRequestOptions = {}
  ): Promise<MoveOutcome> {
    return this.manager.applyMove(gameId, move, options);
  }

  public undo(gameId: string): Promise<GameSnapshot> {
    return this.manager.undo(gameId);
  }

  public playBotMove(
    gameId: string,
    botColor: PlayerColor,
    difficulty?: AIDifficulty
  ): Promise<MoveOutcome | null> {
    return this.manager.playBotMove(gameId, botColor, difficulty);
  }

  public recordGameExperience(
    history: MoveHistoryItem[],
    winner: PlayerColor | 'DRAW',
    modeId?: string
  ): Promise<void> {
    return this.manager.recordGameExperience(history, winner, modeId);
  }

  public resetExperience(): Promise<void> {
    return this.manager.resetExperience();
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }
}
