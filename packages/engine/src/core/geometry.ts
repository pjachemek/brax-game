/**
 * Brax Rules Engine - Geometry & Board Topology
 * Coordinates, edge maps, and orthogonal graph navigation.
 */

import { NodeCoord, PlayerColor, Edge } from './types.ts';

export const BOARD_SIZE = 9; // 9x9 grid of intersection nodes (0..8)

export const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;
export const ROW_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function isValidCoord(coord: NodeCoord): boolean {
  return (
    Number.isInteger(coord.x) &&
    Number.isInteger(coord.y) &&
    coord.x >= 0 &&
    coord.x < BOARD_SIZE &&
    coord.y >= 0 &&
    coord.y < BOARD_SIZE
  );
}

export function areCoordsEqual(a: NodeCoord, b: NodeCoord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function coordToKey(coord: NodeCoord): string {
  return `${coord.x},${coord.y}`;
}

export function keyToCoord(key: string): NodeCoord {
  const parts = key.split(',');
  return {
    x: parseInt(parts[0], 10),
    y: parseInt(parts[1], 10),
  };
}

export function coordToAlgebraic(coord: NodeCoord): string {
  if (!isValidCoord(coord)) {
    return `?(${coord.x},${coord.y})`;
  }
  const col = COLUMN_LABELS[coord.x];
  const row = ROW_LABELS[coord.y];
  return `${col}${row}`;
}

export function algebraicToCoord(notation: string): NodeCoord {
  const trimmed = notation.trim().toUpperCase();
  if (trimmed.length < 2) {
    throw new Error(`Invalid algebraic coordinate: "${notation}"`);
  }
  const colChar = trimmed.charAt(0);
  const rowChar = trimmed.substring(1);

  const colIdx = COLUMN_LABELS.indexOf(colChar as (typeof COLUMN_LABELS)[number]);
  const rowIdx = parseInt(rowChar, 10) - 1;

  if (colIdx === -1 || rowIdx < 0 || rowIdx >= BOARD_SIZE) {
    throw new Error(`Out-of-bounds algebraic coordinate: "${notation}"`);
  }

  return { x: colIdx, y: rowIdx };
}

/**
 * Normalized key for an undirected edge between two nodes.
 */
export function edgeKey(a: NodeCoord, b: NodeCoord): string {
  const kA = coordToKey(a);
  const kB = coordToKey(b);
  return kA < kB ? `${kA}->${kB}` : `${kB}->${kA}`;
}

/**
 * Canonical Brax color assignment for orthogonal segments.
 *
 * Transcribed from the official board artwork ("Brax board -vI.svg"), which draws
 * the colors as two interlocking families:
 *
 *  - Around every odd/odd intersection, a BLUE elbow (up + right) and a RED elbow
 *    (left + down). These carry all segments that touch an odd column or odd row.
 *  - Between the even/even intersections, long staircases of 2-unit segments whose
 *    color flips with each even cell stepped over, in both directions.
 *
 * Coordinates here are engine coordinates, where y = 0 is algebraic row 1 (RED's
 * home rank) and y = 8 is row 9 (BLUE's home rank). Note that the SVG is drawn with
 * row 9 at the top, so its picture is this board flipped vertically.
 *
 * The result is NOT a simple (x + y) checkerboard: the horizontal rule depends on
 * the parity of the row, and the vertical rule on the parity of the column.
 */
export function getCanonicalEdgeColor(from: NodeCoord, to: NodeCoord): PlayerColor | null {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);

  // Must be strictly orthogonal neighbors (distance 1)
  if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
    return null;
  }

  if (dy === 0) {
    // Horizontal segment between (minX, y) and (minX + 1, y)
    const minX = Math.min(from.x, to.x);
    const y = from.y;

    // Odd rows are the elbow family: RED reaches left out of the odd/odd node,
    // BLUE reaches right, so the color alternates with the column.
    if (y % 2 === 1) {
      return minX % 2 === 0 ? 'RED' : 'BLUE';
    }

    // Even rows are the staircase family, flipping every 2 columns and every 2 rows.
    return (Math.floor(minX / 2) + y / 2) % 2 === 1 ? 'RED' : 'BLUE';
  }

  // Vertical segment between (x, minY) and (x, minY + 1)
  const minY = Math.min(from.y, to.y);
  const x = from.x;

  // Odd columns are the elbow family: BLUE reaches up out of the odd/odd node and
  // RED reaches down, which in engine orientation makes RED the even-y segments.
  if (x % 2 === 1) {
    return minY % 2 === 0 ? 'RED' : 'BLUE';
  }

  // Even columns are the staircase family.
  return (x / 2 + Math.floor(minY / 2)) % 2 === 0 ? 'RED' : 'BLUE';
}

/**
 * Generates all 144 canonical edges for the official 9x9 Brax board.
 */
export function generateCanonicalBraxEdges(): Edge[] {
  const edges: Edge[] = [];
  const visited = new Set<string>();

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const from: NodeCoord = { x, y };

      // Horizontal neighbor (to the right)
      if (x + 1 < BOARD_SIZE) {
        const to: NodeCoord = { x: x + 1, y };
        const key = edgeKey(from, to);
        if (!visited.has(key)) {
          visited.add(key);
          const color = getCanonicalEdgeColor(from, to)!;
          edges.push({ from, to, color });
        }
      }

      // Vertical neighbor (downward)
      if (y + 1 < BOARD_SIZE) {
        const to: NodeCoord = { x, y: y + 1 };
        const key = edgeKey(from, to);
        if (!visited.has(key)) {
          visited.add(key);
          const color = getCanonicalEdgeColor(from, to)!;
          edges.push({ from, to, color });
        }
      }
    }
  }

  return edges;
}

/**
 * Returns the immediate orthogonal neighbors of a node that lie within board bounds.
 */
export function getOrthogonalNeighbors(coord: NodeCoord): NodeCoord[] {
  const neighbors: NodeCoord[] = [];
  const deltas = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (const d of deltas) {
    const next: NodeCoord = { x: coord.x + d.x, y: coord.y + d.y };
    if (isValidCoord(next)) {
      neighbors.push(next);
    }
  }

  return neighbors;
}
