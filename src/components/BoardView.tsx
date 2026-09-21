/**
 * Brax Board SVG Component
 * Renders the 9x9 intersection grid, colored orthogonal segments (Red/Blue),
 * pieces, threatened indicators, and legal move trajectories.
 */

import React, { useState } from 'react';
import type {
  GameState,
  MoveAction,
  NodeCoord,
  Piece,
  PlayerColor,
  ThreatenedPieceInfo,
} from '@brax/engine/view';
import {
  BOARD_SIZE,
  CANONICAL_BRAX_BOARD,
  COLUMN_LABELS,
  ROW_LABELS,
  areCoordsEqual,
  coordToAlgebraic,
  coordToKey,
  getPieceAt,
} from '@brax/engine/view';

interface BoardViewProps {
  state: GameState;
  selectedPieceId: string | null;
  validMoves: MoveAction[];
  threats: ThreatenedPieceInfo[];
  onSelectPiece: (pieceId: string) => void;
  onExecuteMove: (move: MoveAction) => void;
  interactive?: boolean;
}

export const BoardView: React.FC<BoardViewProps> = ({
  state,
  selectedPieceId,
  validMoves,
  threats,
  onSelectPiece,
  onExecuteMove,
  interactive = true,
}) => {
  const [hoveredMove, setHoveredMove] = useState<MoveAction | null>(null);

  // SVG grid dimensions
  const padding = 52;
  const cellSize = 56;
  const boardPixelSize = padding * 2 + cellSize * 8; // 52*2 + 448 = 552

  // The board is drawn the way the official artwork is drawn: row 9 at the top,
  // row 1 at the bottom. Engine coordinates run the other way (y = 0 is row 1,
  // RED's home rank), so the vertical axis is inverted here. Every other piece of
  // geometry in this component goes through coordToPx, so this is the only place
  // the orientation is decided.
  function coordToPx(coord: NodeCoord): { x: number; y: number } {
    return {
      x: padding + coord.x * cellSize,
      y: padding + (BOARD_SIZE - 1 - coord.y) * cellSize,
    };
  }

  // Get selected piece info
  let selectedCoord: NodeCoord | null = null;
  let selectedPiece: Piece | null = null;
  if (selectedPieceId) {
    for (const [key, piece] of Object.entries(state.board) as [string, Piece | null][]) {
      if (piece && piece.id === selectedPieceId) {
        const [x, y] = key.split(',').map(Number);
        selectedCoord = { x, y };
        selectedPiece = piece;
        break;
      }
    }
  }

  // Set of threatened piece IDs
  const threatenedPieceIds = new Set(threats.map((t) => t.threatenedPieceId));

  // Destination nodes for valid moves
  const destMap = new Map<string, MoveAction[]>();
  for (const move of validMoves) {
    const key = coordToKey(move.to);
    if (!destMap.has(key)) {
      destMap.set(key, []);
    }
    destMap.get(key)!.push(move);
  }

  const edges = CANONICAL_BRAX_BOARD.getAllEdges();

  return (
    <div className="relative flex flex-col items-center select-none" id="brax-board-container">
      <div className="relative bg-amber-50/40 rounded-2xl p-2 sm:p-4 border border-amber-900/15 shadow-md">
        <svg
          id="brax-svg-board"
          viewBox={`0 0 ${boardPixelSize} ${boardPixelSize}`}
          className="w-full max-w-[540px] aspect-square block"
          style={{ touchAction: 'manipulation' }}
        >
          <defs>
            {/* Subtle background grid tile */}
            <pattern id="cell-bg" width={cellSize} height={cellSize} patternUnits="userSpaceOnUse">
              <rect width={cellSize} height={cellSize} fill="#FFFBEB" fillOpacity="0.4" />
            </pattern>

            {/* Gradients for pieces */}
            <radialGradient id="redPieceGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#F87171" />
              <stop offset="60%" stopColor="#DC2626" />
              <stop offset="100%" stopColor="#991B1B" />
            </radialGradient>

            <radialGradient id="bluePieceGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="60%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1E40AF" />
            </radialGradient>

            {/* Piece drop shadow */}
            <filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Board surface */}
          <rect
            x={padding - 16}
            y={padding - 16}
            width={cellSize * 8 + 32}
            height={cellSize * 8 + 32}
            rx={16}
            fill="#FEF3C7"
            fillOpacity="0.35"
            stroke="#D97706"
            strokeWidth="1.5"
            strokeOpacity="0.3"
          />

          {/* Column labels (A-I) */}
          {COLUMN_LABELS.map((col, idx) => {
            const x = padding + idx * cellSize;
            return (
              <React.Fragment key={`col-${col}`}>
                <text
                  x={x}
                  y={padding - 26}
                  textAnchor="middle"
                  className="font-mono text-xs font-bold fill-slate-600"
                >
                  {col}
                </text>
                <text
                  x={x}
                  y={boardPixelSize - padding + 34}
                  textAnchor="middle"
                  className="font-mono text-xs font-bold fill-slate-600"
                >
                  {col}
                </text>
              </React.Fragment>
            );
          })}

          {/* Row labels (1-9) */}
          {ROW_LABELS.map((row, idx) => {
            const y = coordToPx({ x: 0, y: idx }).y;
            return (
              <React.Fragment key={`row-${row}`}>
                <text
                  x={padding - 26}
                  y={y + 4}
                  textAnchor="middle"
                  className="font-mono text-xs font-bold fill-slate-600"
                >
                  {row}
                </text>
                <text
                  x={boardPixelSize - padding + 26}
                  y={y + 4}
                  textAnchor="middle"
                  className="font-mono text-xs font-bold fill-slate-600"
                >
                  {row}
                </text>
              </React.Fragment>
            );
          })}

          {/* Goal Rank Diamond Indicators, as on the artwork: RED's diamonds sit on
              row 9 (drawn at the top) and BLUE's on row 1, each on the far rank from
              that player's home, for inner columns B-H. */}
          {[1, 2, 3, 4, 5, 6, 7].map((x) => {
            const redGoal = coordToPx({ x, y: BOARD_SIZE - 1 });
            const blueGoal = coordToPx({ x, y: 0 });
            const d = 10;
            return (
              <g key={`diamond-${x}`} opacity="0.45">
                <polygon
                  points={`${redGoal.x},${redGoal.y - d} ${redGoal.x + d},${redGoal.y} ${redGoal.x},${redGoal.y + d} ${redGoal.x - d},${redGoal.y}`}
                  fill="#DC2626"
                />
                <polygon
                  points={`${blueGoal.x},${blueGoal.y - d} ${blueGoal.x + d},${blueGoal.y} ${blueGoal.x},${blueGoal.y + d} ${blueGoal.x - d},${blueGoal.y}`}
                  fill="#2563EB"
                />
              </g>
            );
          })}

          {/* Orthogonal Edges (Colored Red / Blue) */}
          {edges.map((edge) => {
            const p1 = coordToPx(edge.from);
            const p2 = coordToPx(edge.to);
            const isRed = edge.color === 'RED';
            const strokeColor = isRed ? '#DC2626' : '#2563EB';

            return (
              <line
                key={`edge-${edge.from.x},${edge.from.y}-${edge.to.x},${edge.to.y}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={strokeColor}
                strokeWidth={isRed ? 3.5 : 3.5}
                strokeLinecap="round"
                className="transition-colors duration-150"
              />
            );
          })}

          {/* Grid intersection dots */}
          {Array.from({ length: 9 }).map((_, y) =>
            Array.from({ length: 9 }).map((__, x) => {
              const pt = coordToPx({ x, y });
              return (
                <circle
                  key={`dot-${x}-${y}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={3}
                  fill="#475569"
                  opacity="0.6"
                />
              );
            })
          )}

          {/* Preview trajectory for hovered move (shows intermediate bend for distance 2) */}
          {hoveredMove && selectedCoord && (
            <g id="preview-trajectory" pointerEvents="none">
              {hoveredMove.mid ? (
                <>
                  {/* P0 -> P1 */}
                  <line
                    x1={coordToPx(selectedCoord).x}
                    y1={coordToPx(selectedCoord).y}
                    x2={coordToPx(hoveredMove.mid).x}
                    y2={coordToPx(hoveredMove.mid).y}
                    stroke="#10B981"
                    strokeWidth={4}
                    strokeDasharray="4 4"
                  />
                  {/* P1 -> P2 */}
                  <line
                    x1={coordToPx(hoveredMove.mid).x}
                    y1={coordToPx(hoveredMove.mid).y}
                    x2={coordToPx(hoveredMove.to).x}
                    y2={coordToPx(hoveredMove.to).y}
                    stroke="#10B981"
                    strokeWidth={4}
                    strokeDasharray="4 4"
                  />
                  {/* Intermediate marker dot */}
                  <circle
                    cx={coordToPx(hoveredMove.mid).x}
                    cy={coordToPx(hoveredMove.mid).y}
                    r={6}
                    fill="#10B981"
                    fillOpacity="0.8"
                  />
                </>
              ) : (
                <line
                  x1={coordToPx(selectedCoord).x}
                  y1={coordToPx(selectedCoord).y}
                  x2={coordToPx(hoveredMove.to).x}
                  y2={coordToPx(hoveredMove.to).y}
                  stroke="#10B981"
                  strokeWidth={4}
                  strokeDasharray="4 4"
                />
              )}
            </g>
          )}

          {/* Render Board Pieces */}
          {(Object.entries(state.board) as [string, Piece | null][]).map(([key, piece]) => {
            if (!piece) return null;
            const [x, y] = key.split(',').map(Number);
            const pt = coordToPx({ x, y });
            const isSelected = piece.id === selectedPieceId;
            const isRed = piece.color === 'RED';
            const isThreatened = threatenedPieceIds.has(piece.id);
            const isMyTurn = piece.color === state.turn;

            // Check if this piece is at a valid capture destination for selectedPieceId
            const captureMove = destMap.get(key)?.[0];
            const isCaptureTarget = Boolean(captureMove);

            // Brax restricted piece
            const isRestrictedByBrax =
              state.activeBrax &&
              state.activeBrax.victimColor === state.turn &&
              isMyTurn &&
              !state.activeBrax.threatenedPieceIds.includes(piece.id);

            return (
              <g
                key={`piece-${piece.id}`}
                id={`piece-${piece.id}`}
                transform={`translate(${pt.x}, ${pt.y})`}
                className={`transition-transform duration-150 ${
                  isCaptureTarget
                    ? 'cursor-pointer hover:scale-110 active:scale-95'
                    : interactive && isMyTurn && !isRestrictedByBrax
                    ? 'cursor-pointer hover:scale-105'
                    : isRestrictedByBrax
                    ? 'cursor-not-allowed opacity-50'
                    : interactive && !isMyTurn
                    ? 'cursor-pointer hover:opacity-90'
                    : 'cursor-default'
                }`}
                onClick={() => {
                  if (!interactive) return;
                  if (isCaptureTarget && captureMove) {
                    onExecuteMove(captureMove);
                    return;
                  }
                  if (isMyTurn && !isRestrictedByBrax) {
                    onSelectPiece(piece.id);
                  } else if (!isMyTurn) {
                    onSelectPiece(piece.id);
                  }
                }}
                onMouseEnter={() => {
                  if (isCaptureTarget && captureMove) {
                    setHoveredMove(captureMove);
                  }
                }}
                onMouseLeave={() => {
                  if (isCaptureTarget) {
                    setHoveredMove(null);
                  }
                }}
              >
                {/* Threatened warning halo (pulsing) */}
                {isThreatened && (
                  <circle
                    r={24}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth={3}
                    strokeDasharray="5 3"
                    className="animate-pulse"
                  />
                )}

                {/* Selected halo */}
                {isSelected && (
                  <circle
                    r={22}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth={3.5}
                    className="animate-ping"
                    style={{ animationDuration: '2s' }}
                  />
                )}

                {/* Capture target pulsing halo */}
                {isCaptureTarget && (
                  <circle
                    r={23}
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth={3}
                    strokeDasharray="4 3"
                    className="animate-spin"
                    style={{ animationDuration: '4s' }}
                  />
                )}

                {/* Main Piece disc */}
                <circle
                  r={18}
                  fill={isRed ? 'url(#redPieceGrad)' : 'url(#bluePieceGrad)'}
                  stroke={isCaptureTarget ? '#DC2626' : isSelected ? '#10B981' : isRed ? '#7F1D1D' : '#172554'}
                  strokeWidth={isCaptureTarget || isSelected ? 2.5 : 1.5}
                  filter="url(#pieceShadow)"
                />

                {/* Inner decorative rim */}
                <circle
                  r={14}
                  fill="none"
                  stroke={isCaptureTarget ? '#FCA5A5' : isRed ? '#FCA5A5' : '#93C5FD'}
                  strokeWidth={1}
                  strokeOpacity="0.6"
                />

                {/* Piece Identification / Side Symbol */}
                {piece.side === 'MARKED' ? (
                  // Marked side icon (star / diamond)
                  <polygon
                    points="0,-6 2,-2 6,-2 3,1 4,5 0,3 -4,5 -3,1 -6,-2 -2,-2"
                    fill="#FEF08A"
                  />
                ) : (
                  // Plain side: Piece short ID
                  <text
                    y={3.5}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize={10}
                    fontWeight="700"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    pointerEvents="none"
                  >
                    {piece.id}
                  </text>
                )}
              </g>
            );
          })}

          {/* Legal destination target rings (rendered on top of pieces for crisp hit-testing) */}
          {Array.from(destMap.entries()).map(([key, movesAtDest]) => {
            const [x, y] = key.split(',').map(Number);
            const pt = coordToPx({ x, y });
            const destPiece = getPieceAt(state, { x, y });
            const isCapture = Boolean(destPiece && destPiece.color !== state.turn);
            const primaryMove = movesAtDest[0];

            return (
              <g
                key={`dest-${key}`}
                className="cursor-pointer group"
                id={`target-${coordToAlgebraic({ x, y })}`}
                onClick={() => interactive && onExecuteMove(primaryMove)}
                onMouseEnter={() => setHoveredMove(primaryMove)}
                onMouseLeave={() => setHoveredMove(null)}
              >
                {/* Generous hit area */}
                <circle cx={pt.x} cy={pt.y} r={24} fill="transparent" />

                {isCapture ? (
                  // Capture target (Red highlight reticle overlay)
                  <g pointerEvents="none">
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={22}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth={3}
                      strokeDasharray="4 3"
                      className="animate-spin"
                      style={{ animationDuration: '4s' }}
                    />
                    <circle cx={pt.x} cy={pt.y} r={17} fill="#EF4444" fillOpacity="0.25" />
                    {/* Crosshairs */}
                    <line
                      x1={pt.x - 14}
                      y1={pt.y}
                      x2={pt.x - 6}
                      y2={pt.y}
                      stroke="#EF4444"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                    <line
                      x1={pt.x + 6}
                      y1={pt.y}
                      x2={pt.x + 14}
                      y2={pt.y}
                      stroke="#EF4444"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                    <line
                      x1={pt.x}
                      y1={pt.y - 14}
                      x2={pt.x}
                      y2={pt.y - 6}
                      stroke="#EF4444"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                    <line
                      x1={pt.x}
                      y1={pt.y + 6}
                      x2={pt.x}
                      y2={pt.y + 14}
                      stroke="#EF4444"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </g>
                ) : (
                  // Empty destination (Emerald highlight)
                  <>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={16}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      className="group-hover:stroke-emerald-400 group-hover:scale-110 transition-transform"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={6}
                      fill="#10B981"
                      className="group-hover:fill-emerald-400 transition-colors"
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Coordinates Helper Legend */}
      <div className="flex items-center justify-between w-full max-w-[540px] px-2 pt-2 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-1 bg-red-600 rounded"></span>
            Linia Czerwona
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-1 bg-blue-600 rounded"></span>
            Linia Niebieska
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border border-amber-500 bg-amber-200"></span>
          Zagrożenie
        </div>
      </div>
    </div>
  );
};
