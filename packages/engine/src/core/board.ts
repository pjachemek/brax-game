/**
 * Brax Rules Engine - Board Graph
 * Fast lookup for board topology, colored edges, and node adjacencies.
 */

import { NodeCoord, PlayerColor, Edge } from './types.ts';
import {
  coordToKey,
  edgeKey,
  generateCanonicalBraxEdges,
  isValidCoord,
} from './geometry.ts';

export interface BoardNeighbor {
  coord: NodeCoord;
  color: PlayerColor;
}

export class BoardGraph {
  private readonly edgesByKey: Map<string, Edge> = new Map();
  private readonly adjacency: Map<string, BoardNeighbor[]> = new Map();
  private readonly allEdgesList: Edge[];

  constructor(edges: Edge[]) {
    this.allEdgesList = [...edges];

    for (const edge of edges) {
      const key = edgeKey(edge.from, edge.to);
      this.edgesByKey.set(key, edge);

      // Adjacency from -> to
      const fromKey = coordToKey(edge.from);
      if (!this.adjacency.has(fromKey)) {
        this.adjacency.set(fromKey, []);
      }
      this.adjacency.get(fromKey)!.push({ coord: edge.to, color: edge.color });

      // Adjacency to -> from (undirected)
      const toKey = coordToKey(edge.to);
      if (!this.adjacency.has(toKey)) {
        this.adjacency.set(toKey, []);
      }
      this.adjacency.get(toKey)!.push({ coord: edge.from, color: edge.color });
    }
  }

  public getEdge(from: NodeCoord, to: NodeCoord): Edge | null {
    if (!isValidCoord(from) || !isValidCoord(to)) return null;
    const key = edgeKey(from, to);
    return this.edgesByKey.get(key) ?? null;
  }

  public getEdgeColor(from: NodeCoord, to: NodeCoord): PlayerColor | null {
    const edge = this.getEdge(from, to);
    return edge ? edge.color : null;
  }

  public getNeighbors(coord: NodeCoord): BoardNeighbor[] {
    const key = coordToKey(coord);
    return this.adjacency.get(key) ?? [];
  }

  public getNeighborsByColor(coord: NodeCoord, color: PlayerColor): NodeCoord[] {
    const neighbors = this.getNeighbors(coord);
    return neighbors.filter((n) => n.color === color).map((n) => n.coord);
  }

  public getAllEdges(): Edge[] {
    return this.allEdgesList;
  }
}

/**
 * Pre-instantiated standard Brax board graph with official alternating segments.
 */
export const CANONICAL_BRAX_BOARD = new BoardGraph(generateCanonicalBraxEdges());
