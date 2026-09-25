/**
 * ReCheckers Rules Engine - AI entry point.
 *
 * The bot outgrew a single file when it gained a search tree and a persistent
 * memory, so it now lives in `core/ai/`. This module stays as its front door:
 * every existing import of `./core/ai.ts` - the session manager's included -
 * keeps working, and nothing outside the folder has to know how many files the
 * bot is made of.
 */

export * from './ai/index.ts';
