/**
 * Brax Mobile UI - Piece Renderer Component (React Native SVG)
 * Renders an individual piece on the board with distinct colors, side patterns (PLAIN vs MARKED),
 * and dynamic interaction states (selected, threatened, capture target).
 */

import React from 'react';
import { G, Circle, Text as SvgText, Polygon } from 'react-native-svg';
import type { Piece } from '@brax/engine/view';
import { PLAYER_PALETTE, SIGNAL } from '../theme.ts';
import { useShakeOffset } from '../hooks/animations.ts';

export interface PieceRendererProps {
  piece: Piece;
  cx: number;
  cy: number;
  radius: number;
  isSelected?: boolean;
  isThreatened?: boolean;
  isCaptureTarget?: boolean;
  isBraxRestricted?: boolean;
  /**
   * Bumped by the store whenever this piece refused an action (wrong turn, Brax
   * restriction, no legal moves). Every change replays the shake.
   */
  shakeNonce?: number;
  /** Lifted while this piece is being dragged: it is drawn by the drag layer instead. */
  isDragging?: boolean;
  onPress?: () => void;
  /** Fires on pointer-down, before any press — the board uses it to know which
   *  piece a drag started on without doing any coordinate hit-testing. */
  onPressIn?: () => void;
}

export const PieceRenderer: React.FC<PieceRendererProps> = ({
  piece,
  cx,
  cy,
  radius,
  isSelected = false,
  isThreatened = false,
  isCaptureTarget = false,
  isBraxRestricted = false,
  shakeNonce = 0,
  isDragging = false,
  onPress,
  onPressIn,
}) => {
  const shakeOffset = useShakeOffset(shakeNonce, Math.max(4, radius * 0.45));
  const isShaking = shakeOffset !== 0;
  const palette = PLAYER_PALETTE[piece.color];
  const fillColor = palette.piece;
  const strokeColor = isCaptureTarget
    ? SIGNAL.capture
    : isSelected
    ? SIGNAL.select
    : palette.rim;
  const innerRimColor = palette.innerRim;

  return (
    <G
      x={cx + shakeOffset}
      y={cy}
      opacity={isDragging ? 0.25 : isBraxRestricted ? 0.45 : 1}
      onPress={onPress}
      onPressIn={onPressIn}
    >
      {/* Refusal Indicator (Amber Ring, only while the shake plays) */}
      {isShaking && (
        <Circle
          r={radius * 1.45}
          fill="none"
          stroke={SIGNAL.warn}
          strokeWidth={3}
        />
      )}

      {/* Threatened Warning Indicator (Amber Dashed Halo) */}
      {isThreatened && (
        <Circle
          r={radius * 1.35}
          fill="none"
          stroke={SIGNAL.warn}
          strokeWidth={2.5}
          strokeDasharray="4,3"
        />
      )}

      {/* Selected Indicator (Emerald Halo) */}
      {isSelected && (
        <Circle
          r={radius * 1.25}
          fill="none"
          stroke={SIGNAL.select}
          strokeWidth={3}
        />
      )}

      {/* Capture Target Indicator (Red Dashed Reticle Halo) */}
      {isCaptureTarget && (
        <Circle
          r={radius * 1.3}
          fill="none"
          stroke={SIGNAL.capture}
          strokeWidth={3}
          strokeDasharray="4,2"
        />
      )}

      {/* Main Piece Body Disc */}
      <Circle
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected || isCaptureTarget ? 2.5 : 1.5}
      />

      {/* Inner Decorative Rim */}
      <Circle
        r={radius * 0.76}
        fill="none"
        stroke={innerRimColor}
        strokeWidth={1}
        strokeOpacity={0.7}
      />

      {/* Side Marker Pattern: PLAIN vs MARKED */}
      {piece.side === 'MARKED' ? (
        // MARKED Side: Distinctive gold star/diamond core pattern
        <Polygon
          points={`0,${-radius * 0.45} ${radius * 0.16},${-radius * 0.15} ${radius * 0.45},${-radius * 0.15} ${radius * 0.22},${radius * 0.08} ${radius * 0.3},${radius * 0.4} 0,${radius * 0.2} ${-radius * 0.3},${radius * 0.4} ${-radius * 0.22},${radius * 0.08} ${-radius * 0.45},${-radius * 0.15} ${-radius * 0.16},${-radius * 0.15}`}
          fill="#FDE047"
          stroke="#CA8A04"
          strokeWidth={0.5}
        />
      ) : (
        // PLAIN Side: Piece identification text label
        <SvgText
          y={radius * 0.22}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize={Math.round(radius * 0.58)}
          fontWeight="bold"
          fontFamily="System"
        >
          {piece.id}
        </SvgText>
      )}
    </G>
  );
};
