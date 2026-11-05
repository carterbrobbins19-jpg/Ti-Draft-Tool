import { seatDraft } from "@/lib/board";
import { oppositePosition } from "@/lib/draft-rules";
import { factionName } from "@/lib/labels";
import { homeTileForFaction, normalizeTileId, readStoredTiles } from "@/lib/tiles";
import type { DraftRoom } from "@/lib/types";

export const HEX_SIZE = 34;

export const POSITION_COLORS = ["#e4c27a", "#8b7cff", "#6cb6ff", "#e08bb8", "#7dcea0", "#f0a36b"] as const;

export const POSITION_LABELS: Record<number, string> = {
  1: "Top",
  2: "Upper right",
  3: "Right",
  4: "Lower right",
  5: "Lower left",
  6: "Left",
};

export type HexRole = "mecatol" | "system" | "main" | "minor";

export type GalaxyHex = {
  q: number;
  r: number;
  position: number | null;
  role: HexRole;
  slot: 0 | 1 | 2 | 3 | null;
};

type Axial = { q: number; r: number };

const TEMPLATE: Array<Omit<GalaxyHex, "position">> = [
  { role: "system", slot: 0, q: 1, r: 0 },
  { role: "minor", slot: null, q: 1, r: 1 },
  { role: "system", slot: 1, q: 2, r: 0 },
  { role: "system", slot: 3, q: 3, r: -1 },
  { role: "system", slot: 2, q: 2, r: 1 },
  { role: "main", slot: null, q: 3, r: 0 },
];

function rotate60(q: number, r: number): Axial {
  const x = q;
  const z = r;
  const y = -x - z;
  return { q: -z, r: -y };
}

function spin(hex: Axial, turns: number): Axial {
  let current = hex;
  for (let step = 0; step < turns; step += 1) current = rotate60(current.q, current.r);
  return current;
}

function positionForTurn(turn: number): number {
  return ((turn + 2) % 6) + 1;
}

function buildGalaxy(): GalaxyHex[] {
  const hexes: GalaxyHex[] = [{ q: 0, r: 0, position: null, role: "mecatol", slot: null }];
  for (let turn = 0; turn < 6; turn += 1) {
    const position = positionForTurn(turn);
    for (const cell of TEMPLATE) {
      const spun = spin(cell, turn);
      hexes.push({ ...cell, ...spun, position });
    }
  }
  return hexes;
}

export const GALAXY: readonly GalaxyHex[] = buildGalaxy();

export function axialKey(hex: Axial): string {
  return `${hex.q},${hex.r}`;
}

export function cubeParts(hex: Axial): { x: number; y: number; z: number } {
  const x = hex.q;
  const z = hex.r;
  return { x, y: -x - z, z };
}

export function ringOf(hex: Axial): number {
  const cube = cubeParts(hex);
  return (Math.abs(cube.x) + Math.abs(cube.y) + Math.abs(cube.z)) / 2;
}

export function isOuterCorner(hex: Axial): boolean {
  const cube = cubeParts(hex);
  const values = [Math.abs(cube.x), Math.abs(cube.y), Math.abs(cube.z)];
  return ringOf(hex) === 3 && values.includes(0) && values.includes(3);
}

export function hexPixel(q: number, r: number, size = HEX_SIZE): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: size * (3 / 2) * r,
  };
}

export function hexDistance(a: Axial, b: Axial): number {
  const left = cubeParts(a);
  const right = cubeParts(b);
  return (Math.abs(left.x - right.x) + Math.abs(left.y - right.y) + Math.abs(left.z - right.z)) / 2;
}

export type SeatPlacement = {
  position: number;
  playerName: string | null;
  sliceName: string | null;
  tileIds: readonly string[];
  mainFaction: string | null;
  oppositeMinorFaction: string | null;
  legacy: boolean;
};

export type PlacedHex = GalaxyHex & {
  tileId: string | null;
  playerName: string | null;
  sliceName: string | null;
  factionName: string | null;
  homeTileId: string | null;
  color: string | null;
  legacy: boolean;
};

export function positionColor(position: number | null): string | null {
  if (!position) return null;
  return POSITION_COLORS[(position - 1) % POSITION_COLORS.length] ?? null;
}

function cleanName(value: string | null): string | null {
  if (!value || value === "—") return null;
  return value;
}

export function placeGalaxy(seats: readonly SeatPlacement[]): PlacedHex[] {
  const byPosition = new Map(seats.map((seat) => [seat.position, seat]));
  return GALAXY.map((hex) => {
    const seat = hex.position ? byPosition.get(hex.position) : undefined;
    const color = seat?.playerName ? positionColor(hex.position) : null;
    if (hex.role === "mecatol") {
      return {
        ...hex,
        tileId: "18",
        playerName: null,
        sliceName: null,
        factionName: null,
        homeTileId: null,
        color: null,
        legacy: false,
      };
    }
    const factionName = hex.role === "main" ? (seat?.mainFaction ?? null) : hex.role === "minor" ? (seat?.oppositeMinorFaction ?? null) : null;
    const tileId = hex.role === "system" && hex.slot !== null ? normalizeTileId(seat?.tileIds[hex.slot] ?? "") || null : null;
    return {
      ...hex,
      tileId,
      playerName: seat?.playerName ?? null,
      sliceName: seat?.sliceName ?? null,
      factionName,
      homeTileId: factionName ? (homeTileForFaction(factionName)?.id ?? null) : null,
      color,
      legacy: Boolean(seat?.legacy),
    };
  });
}

export function seatsFromRoom(room: DraftRoom): SeatPlacement[] {
  const revealed = room.draft.status === "revealed";
  return [1, 2, 3, 4, 5, 6].map((position) => {
    const player = room.players.find((entry) => seatDraft(room.picks, entry.id).position === position) ?? null;
    const drafted = player ? seatDraft(room.picks, player.id) : null;
    const slice = drafted?.sliceId ? (room.slices.find((entry) => entry.id === drafted.sliceId) ?? null) : null;
    const stored = readStoredTiles(Array.isArray(slice?.tile_ids) ? slice.tile_ids : []);
    const oppositePlayer = room.players.find((entry) => seatDraft(room.picks, entry.id).position === oppositePosition(position)) ?? null;
    return {
      position,
      playerName: player?.name ?? null,
      sliceName: slice?.name ?? null,
      tileIds: stored.legacy ? ["", "", "", ""] : stored.slots,
      mainFaction: revealed && player ? cleanName(factionName(room.factions, player.main_faction_id)) : null,
      oppositeMinorFaction: revealed && oppositePlayer ? cleanName(factionName(room.factions, oppositePlayer.minor_faction_id)) : null,
      legacy: Boolean(stored.legacy),
    };
  });
}

const SAMPLE_TILES = ["19", "20", "21", "22", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45"];

export function sampleSeats(): SeatPlacement[] {
  return [1, 2, 3, 4, 5, 6].map((position) => ({
    position,
    playerName: `Player ${position}`,
    sliceName: `Slice ${position}`,
    tileIds: SAMPLE_TILES.slice((position - 1) * 4, position * 4),
    mainFaction: position === 1 ? "Federation of Sol" : null,
    oppositeMinorFaction: position === 4 ? "Hacan" : null,
    legacy: false,
  }));
}
