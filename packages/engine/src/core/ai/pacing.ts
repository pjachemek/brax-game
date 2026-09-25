/**
 * ReCheckers AI - Pacing.
 *
 * A bot that answers the instant a piece lands does not read as an opponent; it
 * reads as the board rejecting the move and redrawing itself. The eye needs a
 * beat to register what it just played before the reply arrives, and a reply
 * that is always exactly as fast makes the opponent feel mechanical - so the
 * delay is a range, not a constant.
 *
 * This is a floor on the *visible* turnaround, not an added wait: a Master
 * search that took 400ms has already spent the whole budget, and the bot moves
 * as soon as it is done. Only a search that finished sooner is held back.
 *
 * Both front ends import this rather than each picking its own numbers, because
 * "how fast does the bot feel" is a property of the opponent, not of a platform.
 */

/** Shortest visible gap between a human's move and the bot's reply, in ms. */
export const BOT_PACING_MIN_MS = 350;
/** Longest such gap. */
export const BOT_PACING_MAX_MS = 600;

/** A pacing delay in the range above. */
export function botPacingDelay(random: () => number = Math.random): number {
  return BOT_PACING_MIN_MS + random() * (BOT_PACING_MAX_MS - BOT_PACING_MIN_MS);
}

/**
 * Runs `work` and returns no sooner than a pacing delay from now.
 *
 * The delay runs *alongside* the work rather than after it, so thinking time
 * already spent counts towards the pause. That keeps a Novice reply (a few
 * dozen playouts, effectively instant) and a Master reply (the full 400ms) from
 * feeling like two different opponents in a row.
 */
export async function withBotPacing<T>(
  work: Promise<T> | (() => Promise<T>),
  random: () => number = Math.random
): Promise<T> {
  const started = Date.now();
  const result = await (typeof work === 'function' ? work() : work);
  const remaining = botPacingDelay(random) - (Date.now() - started);
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}
