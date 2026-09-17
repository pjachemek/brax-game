/**
 * Brax Mobile UI - Responsive 9x9 Game Board Component (React Native SVG)
 * Renders the 9x9 Brax grid, colored orthogonal edges, starting rank labels 1..7,
 * 81 touch-target intersection nodes, pieces, and valid move highlights.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Circle, G, Text as SvgText, Rect } from 'react-native-svg';
import { useGameStore } from './useGameStore.ts';
import { PieceRenderer } from './PieceRenderer.tsx';
import { useFlash, usePulse } from './animations.ts';
import { CANONICAL_BRAX_BOARD } from '../engine/board.ts';
import { NodeCoord, Piece } from '../engine/types.ts';
import { BOARD_SIZE, areCoordsEqual } from '../engine/geometry.ts';

export interface BraxBoardProps {
  size?: number;
}

export const BraxBoard: React.FC<BraxBoardProps> = ({ size }) => {
  const windowDims = useWindowDimensions();
  const availableWidth = size ?? Math.min(windowDims.width - 24, 480);

  const {
    gameState,
    selectedPieceId,
    validMoves,
    rejectedPieceId,
    rejectionNonce,
    targetHintNonce,
    selectPiece,
    selectDestination,
  } = useGameStore();

  // Responsive board geometry layout.
  //
  // The padding is derived from what actually has to fit inside it rather than from
  // a flat percentage: a band at each edge for the rank labels, plus room beyond it
  // for a piece sitting on an outermost rank. A flat percentage left the labels to
  // land on the board's own border at smaller sizes, striking the digits through.
  const boardSize = availableWidth;
  const labelFontSize = Math.max(9, boardSize * 0.028);
  const labelInset = 6; // gap between a label and the board's outer edge
  const labelBand = labelFontSize + labelInset + 2;
  const padding = labelBand + boardSize * 0.045;
  const innerGridSize = boardSize - 2 * padding;
  const cellSize = innerGridSize / 8;
  // Capped so a piece on an outermost rank can never reach into the label band.
  const pieceRadius = Math.max(9, Math.min(cellSize * 0.38, padding - labelBand));

  // Helper: map grid coordinate (0..8, 0..8) to pixel coordinates (cx, cy).
  // The board is drawn like the official artwork: row 9 at the top, row 1 at the
  // bottom. Engine coordinates run the other way (y = 0 is row 1, RED's home rank),
  // so the vertical axis is inverted here — the single place orientation is decided.
  const coordToPx = (coord: NodeCoord) => {
    return {
      cx: padding + coord.x * cellSize,
      cy: padding + (BOARD_SIZE - 1 - coord.y) * cellSize,
    };
  };

  // Map of valid move destinations for quick lookup
  const destMap = useMemo(() => {
    const map = new Map<string, { to: NodeCoord; isCapture: boolean }>();
    for (const move of validMoves) {
      const key = `${move.to.x},${move.to.y}`;
      const targetPiece = gameState.board[key];
      const isCapture = Boolean(targetPiece && targetPiece.color !== gameState.turn);
      map.set(key, { to: move.to, isCapture });
    }
    return map;
  }, [validMoves, gameState.board, gameState.turn]);

  // Set of threatened piece IDs (if under Brax or threat)
  const threatenedIds = useMemo(() => {
    if (gameState.activeBrax && gameState.activeBrax.victimColor === gameState.turn) {
      return new Set(gameState.activeBrax.threatenedPieceIds);
    }
    return new Set<string>();
  }, [gameState.activeBrax, gameState.turn]);

  const allEdges = useMemo(() => CANONICAL_BRAX_BOARD.getAllEdges(), []);

  // 81 intersection grid coordinates
  const allNodes: NodeCoord[] = useMemo(() => {
    const nodes: NodeCoord[] = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        nodes.push({ x, y });
      }
    }
    return nodes;
  }, []);

  return (
    <View style={[styles.container, { width: boardSize, height: boardSize }]}>
      <Svg width={boardSize} height={boardSize}>
        {/* Background Board Surface */}
        <Rect
          x={2}
          y={2}
          width={boardSize - 4}
          height={boardSize - 4}
          rx={16}
          fill="#FFFDF7"
          stroke="#E2E8F0"
          strokeWidth={2}
        />

        {/* Orthogonal Colored Edges (RED or BLUE) */}
        {allEdges.map((edge) => {
          const fromPt = coordToPx(edge.from);
          const toPt = coordToPx(edge.to);
          const isRedEdge = edge.color === 'RED';
          const strokeColor = isRedEdge ? '#EF4444' : '#3B82F6';

          return (
            <G key={`edge-${edge.from.x},${edge.from.y}-${edge.to.x},${edge.to.y}`}>
              <Line
                x1={fromPt.cx}
                y1={fromPt.cy}
                x2={toPt.cx}
                y2={toPt.cy}
                stroke={strokeColor}
                strokeWidth={3}
                strokeLinecap="round"
              />
            </G>
          );
        })}

        {/* Starting Ranks Labels (1..7 on Nodes B..H along both home ranks).
            BLUE's home rank (y=8) is drawn at the top, RED's (y=0) at the bottom.
            Both are anchored to the board's edge rather than offset from the node,
            so they sit in the reserved label band at any board size. SVG text is
            positioned by its baseline, hence the +labelFontSize at the top. */}
        {[1, 2, 3, 4, 5, 6, 7].map((num) => {
          const { cx } = coordToPx({ x: num, y: 0 });

          return (
            <G key={`rank-label-${num}`}>
              {/* Top edge (Blue home rank) subtle starting number label */}
              <SvgText
                x={cx}
                y={labelInset + labelFontSize}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontWeight="bold"
                fill="#94A3B8"
              >
                {num}
              </SvgText>

              {/* Bottom edge (Red home rank) subtle starting number label */}
              <SvgText
                x={cx}
                y={boardSize - labelInset}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontWeight="bold"
                fill="#94A3B8"
              >
                {num}
              </SvgText>
            </G>
          );
        })}

        {/* 81 Intersection Node Dots (Delicate Background Reference Points) */}
        {allNodes.map((coord) => {
          const pt = coordToPx(coord);
          return (
            <G key={`dot-${coord.x},${coord.y}`}>
              <Circle
                cx={pt.cx}
                cy={pt.cy}
                r={2.5}
                fill="#CBD5E1"
              />
            </G>
          );
        })}

        {/* Pieces Layer */}
        {(Object.entries(gameState.board) as [string, Piece | null][]).map(([key, piece]) => {
          if (!piece) return null;
          const [x, y] = key.split(',').map(Number);
          const pt = coordToPx({ x, y });
          const isSelected = piece.id === selectedPieceId;
          const isThreatened = threatenedIds.has(piece.id);
          const isCaptureTarget = destMap.get(key)?.isCapture ?? false;

          const isBraxRestricted =
            gameState.activeBrax !== null &&
            gameState.activeBrax.victimColor === gameState.turn &&
            piece.color === gameState.turn &&
            !threatenedIds.has(piece.id);

          return (
            <PieceRenderer
              key={`piece-${piece.id}`}
              piece={piece}
              cx={pt.cx}
              cy={pt.cy}
              radius={pieceRadius}
              isSelected={isSelected}
              isThreatened={isThreatened}
              isCaptureTarget={isCaptureTarget}
              isBraxRestricted={isBraxRestricted}
              shakeNonce={piece.id === rejectedPieceId ? rejectionNonce : 0}
              onPress={() => selectPiece(piece.id)}
            />
          );
        })}

        {/* Valid Move Destination Highlights Layer (pulsing) */}
        <MoveTargetsLayer
          destinations={Array.from(destMap.entries()).map(([key, dest]) => ({
            key,
            ...coordToPx(dest.to),
            isCapture: dest.isCapture,
            onPress: () => selectDestination(dest.to),
          }))}
          cellSize={cellSize}
          pieceRadius={pieceRadius}
          hintNonce={targetHintNonce}
        />

        {/* Touch Target Layer for 81 Intersections (Guarantees responsive touch everywhere) */}
        {allNodes.map((coord) => {
          const pt = coordToPx(coord);
          const key = `${coord.x},${coord.y}`;
          const isDest = destMap.has(key);
          const hasPiece = gameState.board[key] !== null;

          // Only add empty node clicker if not destination (destinations already have hit targets)
          if (isDest || hasPiece) return null;

          return (
            <G key={`touch-${coord.x},${coord.y}`}>
              <Circle
                cx={pt.cx}
                cy={pt.cy}
                r={cellSize * 0.42}
                fill="transparent"
                onPress={() => {
                  // If user clicks an empty node while a piece is selected, check or unselect
                  if (selectedPieceId) {
                    selectDestination(coord);
                  }
                }}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
};

interface MoveTarget {
  key: string;
  cx: number;
  cy: number;
  isCapture: boolean;
  onPress: () => void;
}

/**
 * All valid-move markers, pulsing together off a single animation loop so that a
 * selected piece announces its options without any layout-level banner. Kept as
 * its own component so the pulse re-renders the markers, not the whole board.
 */
const MoveTargetsLayer: React.FC<{
  destinations: MoveTarget[];
  cellSize: number;
  pieceRadius: number;
  hintNonce: number;
}> = ({ destinations, cellSize, pieceRadius, hintNonce }) => {
  const phase = usePulse(destinations.length > 0);
  const flash = useFlash(hintNonce);
  // 0..1 triangle wave: a soft breathe rather than a hard blink.
  const wave = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  // A mistaken tap beats the same markers harder for a moment instead of
  // producing an error message.
  const ringScale = 1 + wave * 0.22 + flash * 0.4;
  const ringOpacity = Math.min(1, 0.55 + wave * 0.45 + flash);
  const ringWidth = 2.5 + flash * 2;

  return (
    <G>
      {destinations.map((dest) => (
        <G key={`dest-${dest.key}`} onPress={dest.onPress}>
          {/* Invisible Large Hit Area */}
          <Circle cx={dest.cx} cy={dest.cy} r={cellSize * 0.46} fill="transparent" />

          {dest.isCapture ? (
            // Capture Highlight: Red reticle ring overlaying target
            <G>
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={pieceRadius * 1.32 * ringScale}
                fill="none"
                stroke="#EF4444"
                strokeWidth={ringWidth}
                strokeOpacity={ringOpacity}
                strokeDasharray="4,3"
              />
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={pieceRadius * 0.9}
                fill="#EF4444"
                fillOpacity={0.15 + wave * 0.2}
              />
            </G>
          ) : (
            // Empty Destination Highlight: Emerald breathing circle
            <G>
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={cellSize * 0.32 * ringScale}
                fill="none"
                stroke="#10B981"
                strokeWidth={ringWidth}
                strokeOpacity={ringOpacity}
              />
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={cellSize * 0.12}
                fill="#10B981"
                fillOpacity={ringOpacity}
              />
            </G>
          )}
        </G>
      ))}
    </G>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
