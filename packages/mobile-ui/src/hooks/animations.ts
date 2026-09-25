/**
 * ReCheckers Mobile UI - Lightweight animation hooks (React Native compatible)
 *
 * Both hooks drive their own requestAnimationFrame loop and are meant to be used
 * by the smallest component that needs them, so a running animation re-renders a
 * single piece or the move-highlight layer instead of the whole board.
 */

import { useEffect, useRef, useState } from 'react';

/** ~30fps is plenty for these effects and halves the render work of a 60fps loop. */
const FRAME_MS = 33;

/**
 * A continuous 0..1 pulse phase while `active`. Returns 0 when inactive, so a
 * component that is not animating renders a stable, non-blinking frame.
 */
export function usePulse(active: boolean, periodMs = 1100): number {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }

    let rafId: number;
    let lastFrame = 0;
    const start = Date.now();

    const tick = () => {
      const now = Date.now();
      if (now - lastFrame >= FRAME_MS) {
        lastFrame = now;
        setPhase(((now - start) % periodMs) / periodMs);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, periodMs]);

  return phase;
}

/**
 * A damped horizontal shake offset, restarted every time `nonce` changes to a
 * positive value. `nonce` (rather than a boolean) so that repeating the same
 * rejected action replays the animation instead of doing nothing.
 *
 * A drop back to 0 — which is what the previously rejected piece sees when some
 * other piece gets rejected — is deliberately ignored, otherwise two pieces
 * would shake on every refusal.
 */
export function useShakeOffset(nonce: number, amplitude = 5, durationMs = 420): number {
  const [offset, setOffset] = useState(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (nonce <= 0) return;

    let rafId: number;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= durationMs) {
        setOffset(0);
        return;
      }
      const progress = elapsed / durationMs;
      // Three oscillations, fading out linearly.
      setOffset(Math.sin(progress * Math.PI * 6) * amplitude * (1 - progress));
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      setOffset(0);
    };
  }, [nonce, amplitude, durationMs]);

  return offset;
}

/**
 * A one-shot 1..0 decay, restarted every time `nonce` changes to a positive
 * value. Used to flash something that is already on screen — an answer to "you
 * tapped the wrong spot, here is the right one" that needs no extra chrome.
 */
export function useFlash(nonce: number, durationMs = 700): number {
  const [intensity, setIntensity] = useState(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (nonce <= 0) return;

    let rafId: number;
    let lastFrame = 0;
    const start = Date.now();

    const tick = () => {
      const now = Date.now();
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        setIntensity(0);
        return;
      }
      if (now - lastFrame >= FRAME_MS) {
        lastFrame = now;
        const progress = elapsed / durationMs;
        // Two quick beats under a linear fade-out.
        setIntensity(Math.abs(Math.sin(progress * Math.PI * 2)) * (1 - progress));
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      setIntensity(0);
    };
  }, [nonce, durationMs]);

  return intensity;
}
