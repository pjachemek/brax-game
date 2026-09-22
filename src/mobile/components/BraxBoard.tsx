/**
 * Brax Mobile UI - Responsive 9x9 Game Board Component (React Native SVG)
 * Renders the 9x9 Brax grid, colored orthogonal edges, starting rank labels 1..7,
 * 81 touch-target intersection nodes, pieces, and valid move highlights.
 *
 * A move can be made either way round: tap the piece then tap the target, or
 * drag the piece onto the target. Both funnel into the same two store actions.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Circle, G, Text as SvgText, Rect } from 'react-native-svg';
import { useGameStore } from '../store/useGameStore.ts';
import { BOARD_SURFACE, PLAYER_PALETTE, SIGNAL } from '../theme.ts';
import { PieceRenderer } from './PieceRenderer.tsx';
import { useFlash, usePulse } from '../hooks/animations.ts';
import { BOARD_SIZE, CANONICAL_BRAX_BOARD, areCoordsEqual } from '@brax/engine/view';
import type { NodeCoord, Piece } from '@brax/engine/view';

export interface BraxBoardProps {
  size?: number;
}

/**
 * Everything the browser does to a drag that begins on a piece, switched off.
 *
 *  - `touchAction`: without it a touch drag pans the page instead of reaching the
 *    responder. Chess-style boards all do this: the board itself is not a scroll
 *    surface, the space around it is.
 *  - `userSelect`: the board is full of real text — the rank labels and the ID on
 *    every plain piece — so a drag across it was being read as a text selection,
 *    leaving highlighted digits behind and, on desktop, dragging the glyph rather
 *    than the piece. The prefixed spellings are still needed for Safari and for
 *    older WebViews, where the unprefixed property alone does nothing.
 *  - `WebkitTouchCallout`: suppresses iOS's press-and-hold copy/share bubble.
 *  - `WebkitTapHighlightColor`: no grey flash box over a tapped piece on Android.
 */
const WEB_DRAG_SURFACE =
  Platform.OS === 'web'
    ? ({
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      } as never)
    : null;

/** Movement, in px, before a press is treated as a drag rather than a tap. */
const DRAG_THRESHOLD = 6;
/**
 * A dragged piece is drawn this far *above* the finger rather than under it, so
 * the piece is never the thing the fingertip is covering.
 *
 * The lift is drawing only: the square being aimed is the one under the finger.
 * Resolving at the lifted piece instead made the gesture directional — the lift
 * always points up the screen, so a RED piece advancing up the board reached its
 * next square with almost no travel at all (one cell up, minus a lift of nearly
 * one cell) and never passed the arm threshold, while the same move for BLUE,
 * coming down the board, needed close to two cells. Red pieces felt unliftable
 * and blue ones did not. Aiming at the finger costs nothing here, because what
 * says where the piece will land is the held-open marker under it, not the disc
 * riding above.
 */
const DRAG_LIFT_CELLS = 0.92;
/**
 * How far the finger must travel before the drop is armed. Below this the piece
 * is lifted but nothing is aimed yet, so a grab that turns out to be a tap — or
 * a hand that shifts by a few pixels — returns the piece home with its selection
 * intact instead of playing the square the lift happens to hover.
 */
const DRAG_COMMIT_CELLS = 0.5;
/** A piece's radius as a fraction of one cell. */
const PIECE_RADIUS_RATIO = 0.44;
/** Daylight between a piece on an outermost rank and the rank-label band. */
const EDGE_GAP = 3;
/** The dragged piece is drawn this much larger than it sits on the board. */
const DRAG_SCALE = 1.3;
/** How long after a drop a press is ignored, so the release is not also a tap. */
const PRESS_SUPPRESSION_MS = 250;

interface DragState {
  pieceId: string;
  /** Square the piece was lifted from. */
  from: NodeCoord;
  /** That square in board pixels — the origin every gesture delta is added to. */
  originX: number;
  originY: number;
  /**
   * Where the gesture currently points, in board pixels: the square under the
   * finger, which is the one the drop resolves to. The piece is *drawn* a lift
   * above this point.
   */
  x: number;
  y: number;
  /** True once the gesture has travelled far enough for the drop to count. */
  armed: boolean;
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
  const labelInset = 6; // clear space on either side of a label within its band
  // The band reserved at the top and bottom edge for the rank labels. Labels are
  // centred in it, so it has to hold the digits plus the inset twice over.
  const labelBand = labelFontSize + 2 * labelInset;
  // The grid and the pieces are solved together rather than in sequence. Padding
  // used to be a flat fraction of the board and the radius was then clipped to
  // whatever that left over, which made the pieces smaller than the grid could
  // afford. Here the padding is exactly what a piece on an outermost rank needs —
  // the label band, the piece itself, and a hair of daylight between the two — so
  // the cell size falls out of one equation and the pieces get the rest.
  const cellSize = (boardSize - 2 * (labelBand + EDGE_GAP)) / (8 + 2 * PIECE_RADIUS_RATIO);
  const pieceRadius = Math.max(9, cellSize * PIECE_RADIUS_RATIO);
  const padding = labelBand + pieceRadius + EDGE_GAP;
  const dragLift = cellSize * DRAG_LIFT_CELLS;

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
    if (!gameState) return map;
    for (const move of validMoves) {
      const key = `${move.to.x},${move.to.y}`;
      const targetPiece = gameState.board[key];
      const isCapture = Boolean(targetPiece && targetPiece.color !== gameState.turn);
      map.set(key, { to: move.to, isCapture });
    }
    return map;
  }, [validMoves, gameState?.board, gameState?.turn]);

  // Enemy pieces standing on the intermediate node of a distance 2 move. They
  // are taken as the piece travels over them, so they are just as much a target
  // as the destination and must not look safe while the move is on offer.
  const sweptCaptureKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!gameState) return keys;
    for (const move of validMoves) {
      if (!move.mid) continue;
      const key = `${move.mid.x},${move.mid.y}`;
      const midPiece = gameState.board[key];
      if (midPiece && midPiece.color !== gameState.turn) {
        keys.add(key);
      }
    }
    return keys;
  }, [validMoves, gameState?.board, gameState?.turn]);

  // Set of threatened piece IDs (if under Brax or threat)
  const threatenedIds = useMemo(() => {
    if (gameState?.activeBrax && gameState.activeBrax.victimColor === gameState.turn) {
      return new Set(gameState.activeBrax.threatenedPieceIds);
    }
    return new Set<string>();
  }, [gameState?.activeBrax, gameState?.turn]);

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

  // Drag and drop.
  //
  // The gesture is assembled from two halves, each chosen so it needs nothing
  // platform-specific:
  //  - *which* piece was grabbed comes from that piece's own onPressIn, so the
  //    start of the gesture needs no hit-testing;
  //  - *where it went* is the gesture's dx/dy added to that piece's own square,
  //    so no screen-to-board mapping is needed either — which matters, because
  //    the board is scrollable and its position on screen is not fixed.
  const [drag, setDrag] = useState<DragState | null>(null);
  const pressedPieceRef = useRef<{ id: string; coord: NodeCoord } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // A drop lands as a press too on some platforms; this swallows that one press.
  const suppressPressUntilRef = useRef(0);
  // Selecting a piece is a round trip to the engine, so a fast drag can be
  // released before its legal moves have even arrived. The drop waits on this.
  const selectionRef = useRef<Promise<void> | null>(null);

  /** Nearest intersection to a point in board pixels, or null if off the grid. */
  const pxToCoord = (x: number, y: number): NodeCoord | null => {
    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
    return { x: col, y: BOARD_SIZE - 1 - row };
  };

  // The responder is built once, so it reads the current render's values through
  // a ref rather than closing over stale ones.
  const liveRef = useRef<{
    gameState: typeof gameState;
    selectedPieceId: string | null;
    coordToPx: typeof coordToPx;
    pxToCoord: typeof pxToCoord;
    selectPiece: typeof selectPiece;
    selectDestination: typeof selectDestination;
    commitDistance: number;
  }>(null!);
  liveRef.current = {
    gameState,
    selectedPieceId,
    coordToPx,
    pxToCoord,
    selectPiece,
    selectDestination,
    commitDistance: cellSize * DRAG_COMMIT_CELLS,
  };

  const endDrag = useCallback(() => {
    pressedPieceRef.current = null;
    suppressPressUntilRef.current = Date.now() + PRESS_SUPPRESSION_MS;
    setDrag(null);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Taps must keep reaching the pieces' own press handlers, so the board
        // claims the gesture only once it is unmistakably a drag.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          const pressed = pressedPieceRef.current;
          if (!pressed) return false;
          if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < DRAG_THRESHOLD) return false;

          const live = liveRef.current.gameState;
          if (!live || live.result !== null) return false;

          // Only the side to move drags. An opponent's piece stays tappable,
          // which is how the board offers it as a capture target.
          const piece = live.board[`${pressed.coord.x},${pressed.coord.y}`];
          return Boolean(piece && piece.color === live.turn);
        },
        onPanResponderGrant: () => {
          const pressed = pressedPieceRef.current;
          if (!pressed) return;

          const origin = liveRef.current.coordToPx(pressed.coord);
          setDrag({
            pieceId: pressed.id,
            from: pressed.coord,
            originX: origin.cx,
            originY: origin.cy,
            x: origin.cx,
            y: origin.cy,
            armed: false,
          });

          // Ask for the piece's legal moves now, so the targets are already lit
          // while the player is still looking for one. Selecting the piece that
          // is already selected would toggle it off, hence the guard.
          selectionRef.current =
            liveRef.current.selectedPieceId === pressed.id
              ? Promise.resolve()
              : liveRef.current.selectPiece(pressed.id);
        },
        onPanResponderMove: (_evt, gesture) => {
          const { commitDistance } = liveRef.current;
          const armed = Math.hypot(gesture.dx, gesture.dy) >= commitDistance;
          setDrag((current) =>
            current
              ? {
                  ...current,
                  x: current.originX + gesture.dx,
                  y: current.originY + gesture.dy,
                  armed,
                }
              : null
          );
        },
        // Once the board owns the drag it keeps it: an enclosing ScrollView
        // deciding mid-gesture that it would rather scroll would drop the piece.
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_evt, gesture) => {
          const dropped = dragRef.current;
          endDrag();
          if (!dropped) return;

          // Released before the gesture committed to anywhere: the piece returns
          // home but stays selected, so the move can still be finished by tap.
          if (!dropped.armed) return;

          // Resolved at the finger, which is the square the hovered marker has
          // been holding open all along. The lift moves the piece out of the
          // way of the aim; it is not part of it.
          const target = liveRef.current.pxToCoord(
            dropped.originX + gesture.dx,
            dropped.originY + gesture.dy
          );

          // Dropped off the board or back where it started: same as above.
          if (!target || areCoordsEqual(target, dropped.from)) return;

          void (async () => {
            await selectionRef.current;
            // The selection can be refused — Brax enforcement, or a piece with
            // no legal moves — in which case it never became the selected piece
            // and the shake has already said why.
            if (useGameStore.getState().selectedPieceId !== dropped.pieceId) return;
            await liveRef.current.selectDestination(target);
          })();
        },
        onPanResponderTerminate: () => endDrag(),
      }),
    [endDrag]
  );

  /** True while a press should be ignored because it is a drop's aftermath. */
  const pressSuppressed = () => Date.now() < suppressPressUntilRef.current;

  // The destination the dragged piece is currently over, if it is a legal one.
  const hoverKey = useMemo(() => {
    // Before the gesture commits, nothing is aimed yet, so nothing is armed.
    if (!drag || !drag.armed) return null;
    const over = pxToCoord(drag.x, drag.y);
    if (!over) return null;
    const key = `${over.x},${over.y}`;
    return destMap.has(key) ? key : null;
  }, [drag, destMap, padding, cellSize]);

  // The session is established asynchronously, so there is a beat before the
  // first position arrives. All hooks above run unconditionally to keep their
  // order stable across that transition.
  if (!gameState) {
    return <View style={[styles.container, { width: boardSize, height: boardSize }]} />;
  }

  const draggedPiece = drag ? gameState.board[`${drag.from.x},${drag.from.y}`] : null;

  // A piece lifted off the top rank would ride past the board's edge and be
  // clipped away by the SVG viewport, so it is drawn back inside. Only the
  // drawing moves: the drop resolves at the finger either way, so the piece
  // parking against the top edge changes nothing about what is played.
  const dragDrawY = drag ? Math.max(drag.y - dragLift, pieceRadius * DRAG_SCALE + 2) : 0;

  return (
    <View
      style={[styles.container, { width: boardSize, height: boardSize }, WEB_DRAG_SURFACE]}
      {...panResponder.panHandlers}
    >
      <Svg width={boardSize} height={boardSize}>
        {/* Background Board Surface */}
        <Rect
          x={2}
          y={2}
          width={boardSize - 4}
          height={boardSize - 4}
          rx={16}
          fill={BOARD_SURFACE}
          stroke="#E2E8F0"
          strokeWidth={2}
        />

        {/* Orthogonal Colored Edges (RED or BLUE) */}
        {allEdges.map((edge) => {
          const fromPt = coordToPx(edge.from);
          const toPt = coordToPx(edge.to);
          const strokeColor = PLAYER_PALETTE[edge.color].line;

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
            Both are centred in the reserved label band rather than offset from the
            node, so they clear both the board's rounded border and the outermost
            grid line at any board size. `y` is the text's vertical centre, which
            is what alignmentBaseline="middle" asks for — anchoring digits by their
            baseline instead left them sitting on the bottom border. */}
        {[1, 2, 3, 4, 5, 6, 7].map((num) => {
          const { cx } = coordToPx({ x: num, y: 0 });

          return (
            <G key={`rank-label-${num}`}>
              {/* Top edge (Blue home rank) subtle starting number label */}
              <SvgText
                x={cx}
                y={labelBand / 2}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontSize={labelFontSize}
                fontWeight="bold"
                fill="#94A3B8"
              >
                {num}
              </SvgText>

              {/* Bottom edge (Red home rank) subtle starting number label */}
              <SvgText
                x={cx}
                y={boardSize - labelBand / 2}
                textAnchor="middle"
                alignmentBaseline="middle"
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
          const isCaptureTarget = (destMap.get(key)?.isCapture ?? false) || sweptCaptureKeys.has(key);

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
              isDragging={drag?.pieceId === piece.id}
              onPress={() => {
                if (pressSuppressed()) return;
                void selectPiece(piece.id);
              }}
              onPressIn={() => {
                pressedPieceRef.current = { id: piece.id, coord: { x, y } };
              }}
            />
          );
        })}

        {/* Valid Move Destination Highlights Layer (pulsing) */}
        <MoveTargetsLayer
          destinations={Array.from(destMap.entries()).map(([key, dest]) => ({
            key,
            ...coordToPx(dest.to),
            isCapture: dest.isCapture,
            onPress: () => {
              if (pressSuppressed()) return;
              void selectDestination(dest.to);
            },
          }))}
          cellSize={cellSize}
          pieceRadius={pieceRadius}
          hintNonce={targetHintNonce}
          hoverKey={hoverKey}
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
                  if (pressSuppressed()) return;
                  // If user clicks an empty node while a piece is selected, check or unselect
                  if (selectedPieceId) {
                    void selectDestination(coord);
                  }
                }}
              />
            </G>
          );
        })}

        {/* Drag Layer: the lifted piece, drawn above everything it passes over,
            plus a marker on the square it came from so the position still reads.
            The piece rides a cell above the finger and is drawn larger there, so
            the player is looking at the piece rather than at their own fingertip;
            a faint tether keeps the connection between the two legible. */}
        {drag && draggedPiece && (
          <G>
            <Circle
              cx={drag.originX}
              cy={drag.originY}
              r={pieceRadius * 0.85}
              fill="none"
              stroke={PLAYER_PALETTE[draggedPiece.color].line}
              strokeWidth={1.5}
              strokeDasharray="3,3"
              strokeOpacity={0.8}
            />
            <Line
              x1={drag.x}
              y1={drag.y}
              x2={drag.x}
              y2={dragDrawY + pieceRadius * DRAG_SCALE}
              stroke={PLAYER_PALETTE[draggedPiece.color].line}
              strokeWidth={1.5}
              strokeDasharray="2,3"
              strokeOpacity={0.5}
            />
            <PieceRenderer
              piece={draggedPiece}
              cx={drag.x}
              cy={dragDrawY}
              radius={pieceRadius * DRAG_SCALE}
              isSelected
              isThreatened={threatenedIds.has(draggedPiece.id)}
            />
          </G>
        )}
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
  /** Destination a dragged piece is currently hovering, drawn as armed. */
  hoverKey: string | null;
}> = ({ destinations, cellSize, pieceRadius, hintNonce, hoverKey }) => {
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
      {destinations.map((dest) => {
        // A hovered target is held open and solid rather than breathing: the
        // piece is over it, so it reads as "release here" instead of "consider me".
        const isHovered = dest.key === hoverKey;
        const scale = isHovered ? 1.3 : ringScale;
        const opacity = isHovered ? 1 : ringOpacity;
        const width = isHovered ? ringWidth + 1.5 : ringWidth;

        return (
        <G key={`dest-${dest.key}`} onPress={dest.onPress}>
          {/* Invisible Large Hit Area */}
          <Circle cx={dest.cx} cy={dest.cy} r={cellSize * 0.46} fill="transparent" />

          {dest.isCapture ? (
            // Capture Highlight: Red reticle ring overlaying target
            <G>
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={pieceRadius * 1.32 * scale}
                fill="none"
                stroke={SIGNAL.capture}
                strokeWidth={width}
                strokeOpacity={opacity}
                strokeDasharray={isHovered ? undefined : '4,3'}
              />
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={pieceRadius * 0.9}
                fill={SIGNAL.capture}
                fillOpacity={isHovered ? 0.45 : 0.15 + wave * 0.2}
              />
            </G>
          ) : (
            // Empty Destination Highlight: Emerald breathing circle
            <G>
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={cellSize * 0.32 * scale}
                fill="none"
                stroke={SIGNAL.select}
                strokeWidth={width}
                strokeOpacity={opacity}
              />
              <Circle
                cx={dest.cx}
                cy={dest.cy}
                r={isHovered ? cellSize * 0.22 : cellSize * 0.12}
                fill={SIGNAL.select}
                fillOpacity={opacity}
              />
            </G>
          )}
        </G>
        );
      })}
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
