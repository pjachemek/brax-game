/**
 * ReCheckers AI - public surface of the bot.
 *
 * Read this folder in dependency order:
 *
 *   types.ts       difficulties, profiles, and the shapes everything shares
 *   simulation.ts  fast legal-move generation and state transition for search
 *   zobrist.ts     stable position hashing, the key the book is filed under
 *   evaluation.ts  static scoring and the "should I declare ReCheckers?" heuristic
 *   experience.ts  the Experience Book: priors in, finished games out
 *   storage.ts     where that book is persisted on each platform
 *   mcts.ts        the PUCT search itself
 *   player.ts      ReCheckersBot, which is what callers actually use
 *   pacing.ts      how long a reply is held back so it reads as an opponent
 */

export * from './types.ts';
export { moveKey, toMoveAction, listBotMoves, simulateMove, evaluateTerminal, countPieces } from './simulation.ts';
export type { TerminalVerdict } from './simulation.ts';
export { hashState } from './zobrist.ts';
export { countThreatenedPieces, evaluatePosition, shouldDeclareReCheckers } from './evaluation.ts';
export { ExperienceBook } from './experience.ts';
export type { ExperienceBookOptions } from './experience.ts';
export {
  EXPERIENCE_STORAGE_KEY,
  MemoryExperienceStorage,
  WebStorageExperienceStorage,
  IndexedDbExperienceStorage,
  createDefaultExperienceStorage,
} from './storage.ts';
export type { WebStorageLike, IdbFactoryLike } from './storage.ts';
export { MCTSNode, MCTSSearch, yieldToEventLoop } from './mcts.ts';
export type { MCTSOptions } from './mcts.ts';
export { ReCheckersBot } from './player.ts';
export type { ReCheckersBotOptions, BotMoveDecision } from './player.ts';
export { BOT_PACING_MIN_MS, BOT_PACING_MAX_MS, botPacingDelay, withBotPacing } from './pacing.ts';
