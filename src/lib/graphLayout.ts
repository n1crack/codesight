import type { GraphCommit } from "@/types";

export interface CommitPosition {
  row: number;
  lane: number;
}

export interface GraphEdge {
  fromOid: string;
  toOid: string;
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
}

export interface GraphLayout {
  positions: Map<string, CommitPosition>;
  edges: GraphEdge[];
  totalLanes: number;
}

export function layoutGraph(commits: GraphCommit[]): GraphLayout {
  const lanes: (string | null)[] = [];
  const positions = new Map<string, CommitPosition>();
  let totalLanes = 0;

  const findEmpty = (): number => {
    const idx = lanes.indexOf(null);
    if (idx === -1) {
      lanes.push(null);
      return lanes.length - 1;
    }
    return idx;
  };

  for (let row = 0; row < commits.length; row++) {
    const c = commits[row];

    const waiting: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === c.id) waiting.push(i);
    }

    let myLane: number;
    if (waiting.length === 0) {
      myLane = findEmpty();
    } else {
      myLane = waiting[0];
      for (let k = 1; k < waiting.length; k++) {
        lanes[waiting[k]] = null;
      }
    }
    lanes[myLane] = null;

    positions.set(c.id, { row, lane: myLane });

    if (c.parents.length > 0) {
      lanes[myLane] = c.parents[0];
      for (let pi = 1; pi < c.parents.length; pi++) {
        const p = c.parents[pi];
        const existing = lanes.indexOf(p);
        if (existing !== -1) continue;
        const slot = findEmpty();
        lanes[slot] = p;
      }
    }

    totalLanes = Math.max(totalLanes, lanes.length);
  }

  const edges: GraphEdge[] = [];
  for (const c of commits) {
    const from = positions.get(c.id);
    if (!from) continue;
    for (const parentOid of c.parents) {
      const to = positions.get(parentOid);
      if (!to) continue;
      edges.push({
        fromOid: c.id,
        toOid: parentOid,
        fromRow: from.row,
        fromLane: from.lane,
        toRow: to.row,
        toLane: to.lane,
      });
    }
  }

  return { positions, edges, totalLanes };
}

const LANE_COLOR_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "oklch(0.7 0.18 30)",
  "oklch(0.7 0.18 200)",
  "oklch(0.7 0.18 280)",
];

export function laneColor(lane: number): string {
  return LANE_COLOR_VARS[lane % LANE_COLOR_VARS.length];
}
