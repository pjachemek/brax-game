/**
 * ReCheckers Mobile UI - Colour Palette
 *
 * The two player colours sit next to each other all over the board, so they are
 * chosen against each other rather than picked individually:
 *
 *  - Low chroma. Fully saturated red and blue (the old #EF4444 / #3B82F6) are
 *    near-complementary at high saturation, which makes their edges vibrate on a
 *    bright ground — worst on the 3px lines, where every crossing shimmers. Both
 *    hues here carry roughly half the chroma of the originals.
 *  - Separated in lightness, not just hue. The old pair was almost equiluminant
 *    (1.02:1), so the eye had nothing but hue to lock onto; the muted blue is a
 *    clear step darker than the muted red (1.30:1), which also keeps the two
 *    distinguishable for red-green colour blindness and in greyscale.
 *  - Every colour holds at least 3:1 against the board surface, and the piece
 *    fills hold 5:1+ behind their white ID text.
 */

/** The board's paper ground. Slightly off-white: a pure white ground amplifies
 *  the glare that makes saturated lines shimmer in the first place. */
export const BOARD_SURFACE = '#FAF7F0';

export interface PlayerPalette {
  /** Orthogonal board edges owned by this player. */
  line: string;
  /** Piece body fill — carries white ID text. */
  piece: string;
  /** Piece outer rim. */
  rim: string;
  /** Decorative inner rim on the piece face. */
  innerRim: string;
}

export const PLAYER_PALETTE: Record<'RED' | 'BLUE', PlayerPalette> = {
  RED: {
    line: '#C25E54',
    piece: '#A94F45',
    rim: '#7F3A33',
    innerRim: '#E2B3AC',
  },
  BLUE: {
    line: '#3F6D99',
    piece: '#34597F',
    rim: '#22405E',
    innerRim: '#A8C2D9',
  },
};

/**
 * Interaction signals. These stay deliberately more vivid than the player
 * colours: with the board muted, they are what the eye should be drawn to.
 */
export const SIGNAL = {
  /** Valid move destinations and the selected piece's halo. */
  select: '#0E8F68',
  /** Capture targets and reticles. */
  capture: '#B4483C',
  /** Threatened pieces and refused moves. */
  warn: '#B87310',
};
