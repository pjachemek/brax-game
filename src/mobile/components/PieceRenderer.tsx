/**
 * Brax Mobile UI - Piece Renderer Component (React Native SVG)
 * Renders an individual piece on the board with distinct colors, side patterns (PLAIN vs MARKED),
 * and dynamic interaction states (selected, threatened, capture target).
 */

import React from 'react';
import { G, Circle, Text as SvgText, Polygon } from 'react-native-svg';
import { Piece } from '../../engine/types.ts';
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
  onPress?: () => void;
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
  onPress,
}) => {
  const shakeOffset = useShakeOffset(shakeNonce, Math.max(4, radius * 0.45));
  const isShaking = shakeOffset !== 0;
  const isRed = piece.color === 'RED';
  const fillColor = isRed ? '#DC2626' : '#2563EB';
  const strokeColor = isCaptureTarget
    ? '#EF4444'
    : isSelected
    ? '#10B981'
    : isRed
    ? '#991B1B'
    : '#1E40AF';
  const innerRimColor = isRed ? '#FCA5A5' : '#BFDBFE';

  return (
    <G
      x={cx + shakeOffset}
      y={cy}
      opacity={isBraxRestricted ? 0.45 : 1}
      onPress={onPress}
    >
      {/* Refusal Indicator (Amber Ring, only while the shake plays) */}
      {isShaking && (
        <Circle
          r={radius * 1.45}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={3}
        />
      )}

      {/* Threatened Warning Indicator (Amber Dashed Halo) */}
      {isThreatened && (
        <Circle
          r={radius * 1.35}
          fill="none"
          stroke="#F59E0B"
          strokeWidth={2.5}
          strokeDasharray="4,3"
        />
      )}

      {/* Selected Indicator (Emerald Halo) */}
      {isSelected && (
        <Circle
          r={radius * 1.25}
          fill="none"
          stroke="#10B981"
          strokeWidth={3}
        />
      )}

      {/* Capture Target Indicator (Red Dashed Reticle Halo) */}
      {isCaptureTarget && (
        <Circle
          r={radius * 1.3}
          fill="none"
          stroke="#EF4444"
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
