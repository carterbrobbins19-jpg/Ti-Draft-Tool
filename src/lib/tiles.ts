import catalog from "@/data/tiles.json";

export type TileKind = "system" | "anomaly" | "wormhole" | "empty" | "home" | "mecatol" | "hyperlane" | "gate" | "nexus";

export type TilePlanet = {
  name: string;
  resources: number;
  influence: number;
  trait: "cultural" | "hazardous" | "industrial" | null;
  specialty: string | null;
  legendary: boolean;
};

export type SystemTile = {
  id: string;
  expansion: string;
  type: string;
  kind: TileKind;
  faction: string | null;
  planets: TilePlanet[];
  anomalies: string[];
  wormholes: string[];
  links: number[][];
  note: string | null;
};

const tiles = catalog.tiles as SystemTile[];
const byId = new Map(tiles.map((tile) => [tile.id, tile]));

export const TECH_SPECIALTIES = ["biotic", "warfare", "propulsion", "cybernetic"] as const;

export const SLICE_SLOTS = [
  { index: 0, name: "Top center", detail: "Normal system at the top of the slice" },
  { index: 1, name: "Middle center", detail: "Normal system in the middle" },
  { index: 2, name: "Bottom left", detail: "Normal system at the lower left" },
  { index: 3, name: "Middle right", detail: "Normal system on the right" },
] as const;

export const SLICE_LAYOUT = [
  { id: "top", name: "Top center", editable: true, slot: 0, col: 1, row: 0, role: "system" },
  { id: "minor", name: "Minor home", editable: false, slot: null, col: 0, row: 1, role: "minor" },
  { id: "middle", name: "Middle center", editable: true, slot: 1, col: 1, row: 1, role: "system" },
  { id: "right", name: "Middle right", editable: true, slot: 3, col: 2, row: 1, role: "system" },
  { id: "bottom-left", name: "Bottom left", editable: true, slot: 2, col: 1, row: 2, role: "system" },
  { id: "main", name: "Home system", editable: false, slot: null, col: 2, row: 2, role: "main" },
] as const;

const LEGACY_SLOT_NAMES = ["Home left", "Home front", "Home right", "Equidistant", "Mecatol gate"] as const;

export function legacySlotName(index: number): string {
  return LEGACY_SLOT_NAMES[index] ?? `Tile ${index + 1}`;
}

const anomalyLabels: Record<string, string> = {
  nebula: "Nebula",
  "gravity-rift": "Gravity rift",
  "asteroid-field": "Asteroid field",
  supernova: "Supernova",
  "entropic-scar": "Entropic scar",
  "muaat-supernova": "Muaat supernova",
};

const wormholeLabels: Record<string, string> = {
  alpha: "Alpha",
  beta: "Beta",
  gamma: "Gamma",
  delta: "Delta",
  epsilon: "Epsilon",
  zeta: "Zeta",
  eta: "Eta",
  theta: "Theta",
  iota: "Iota",
  kappa: "Kappa",
};

export function tileCatalog(): readonly SystemTile[] {
  return tiles;
}

export function normalizeTileId(value: string): string {
  return value.trim().toUpperCase().replace(/^#/, "");
}

export function lookupTile(value: string): SystemTile | null {
  const id = normalizeTileId(value);
  if (!id) return null;
  return byId.get(id) ?? null;
}

function factionKey(value: string): string {
  return value.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
}

export function homeTileForFaction(name: string): SystemTile | null {
  const key = factionKey(name);
  if (!key) return null;
  const homes = tiles.filter((tile) => tile.kind === "home" && tile.faction);
  const exact = homes.filter((tile) => factionKey(tile.faction ?? "") === key);
  const pool = exact.length
    ? exact
    : homes.filter((tile) => {
        const faction = factionKey(tile.faction ?? "");
        return key.length >= 4 && (faction.endsWith(key) || key.endsWith(faction));
      });
  if (pool.length === 1) return pool[0] ?? null;
  const withPlanets = pool.filter((tile) => tile.planets.length > 0);
  return withPlanets.length === 1 ? (withPlanets[0] ?? null) : null;
}

export function resolveSliceTile(value: string): string {
  const id = normalizeTileId(value);
  if (!id) throw new Error("Enter a tile number.");
  if (!/^[0-9A-Z]{1,8}$/.test(id)) {
    throw new Error("Tile numbers must be letters and digits, such as 35 or 83A.");
  }
  const tile = lookupTile(id);
  if (!tile) throw new Error(`Tile ${id} is not in the catalog.`);
  if (tile.kind === "home" || tile.kind === "gate" || tile.kind === "mecatol" || tile.kind === "nexus") {
    throw new Error(`Tile ${id} is not a normal system. Home systems are reserved.`);
  }
  return id;
}

export function labelAnomaly(value: string): string {
  return anomalyLabels[value] ?? "Unknown anomaly";
}

export function labelWormhole(value: string): string {
  return wormholeLabels[value] ?? "Unknown wormhole";
}

export function labelSpecialty(value: string): string {
  if (value === "space-station") return "Space station";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function formatStat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function optimalPlanet(resources: number, influence: number): { resources: number; influence: number } {
  if (resources > influence) return { resources, influence: 0 };
  if (influence > resources) return { resources: 0, influence };
  return { resources: resources / 2, influence: influence / 2 };
}

export function specialTileWarning(tile: SystemTile): string | null {
  if (tile.kind === "home" || tile.kind === "gate") return tile.note ?? "Home system. It is not an ordinary slice tile.";
  if (tile.kind === "mecatol") return tile.note ?? "Mecatol Rex is not an ordinary slice tile.";
  if (tile.kind === "hyperlane") return tile.note ?? "Hyperlane connector.";
  if (tile.kind === "nexus") return tile.note ?? "This tile is not placed as a normal map hex.";
  return tile.note;
}

export type SliceStats = {
  resources: number;
  influence: number;
  optimalResources: number;
  optimalInfluence: number;
  planetCount: number;
  specialtyCount: number;
  specialties: string[];
  spaceStations: string[];
  wormholes: string[];
  anomalies: string[];
  legendary: string[];
  unknown: string[];
  warnings: string[];
  planets: string[];
};

export function emptyTileSlots(): string[] {
  return ["", "", "", ""];
}

export function padTileIds(ids: readonly string[]): string[] {
  const next = ids.slice(0, 4).map((id) => normalizeTileId(id));
  while (next.length < 4) next.push("");
  return next;
}

export function readStoredTiles(ids: readonly string[] | null | undefined): { slots: string[]; legacy: string[] | null } {
  const clean = (ids ?? []).map((id) => normalizeTileId(id));
  if (normalizeTileId(clean[4] ?? "") !== "") {
    return {
      slots: emptyTileSlots(),
      legacy: [0, 1, 2, 3, 4].map((index) => clean[index] ?? ""),
    };
  }
  return { slots: padTileIds(clean), legacy: null };
}

export function incompleteSliceMessage(name: string, ids: readonly string[]): string | null {
  const slots = padTileIds(ids);
  const filled = slots.filter((id) => id !== "");
  if (filled.length === 0) return null;
  if (filled.length !== 4 || slots.some((id) => id === "")) {
    return `${name} needs exactly four system tiles. Home systems are reserved.`;
  }
  return null;
}

export function hasTileIds(ids: readonly string[]): boolean {
  return ids.some((id) => normalizeTileId(id) !== "");
}

export function buildSliceStats(ids: readonly string[]): SliceStats {
  const stats: SliceStats = {
    resources: 0,
    influence: 0,
    optimalResources: 0,
    optimalInfluence: 0,
    planetCount: 0,
    specialtyCount: 0,
    specialties: [],
    spaceStations: [],
    wormholes: [],
    anomalies: [],
    legendary: [],
    unknown: [],
    warnings: [],
    planets: [],
  };
  for (const raw of ids) {
    const id = normalizeTileId(raw);
    if (!id) continue;
    const tile = lookupTile(id);
    if (!tile) {
      stats.unknown.push(id);
      continue;
    }
    const warning = specialTileWarning(tile);
    if (warning && (tile.kind === "home" || tile.kind === "gate" || tile.kind === "mecatol" || tile.kind === "hyperlane" || tile.kind === "nexus")) {
      stats.warnings.push(`${id}: ${warning}`);
    }
    for (const planet of tile.planets) {
      stats.planets.push(planet.name);
      stats.planetCount += 1;
      stats.resources += planet.resources;
      stats.influence += planet.influence;
      const optimal = optimalPlanet(planet.resources, planet.influence);
      stats.optimalResources += optimal.resources;
      stats.optimalInfluence += optimal.influence;
      if (planet.legendary) stats.legendary.push(planet.name);
      if (planet.specialty && TECH_SPECIALTIES.includes(planet.specialty as (typeof TECH_SPECIALTIES)[number])) {
        stats.specialtyCount += 1;
        if (!stats.specialties.includes(planet.specialty)) stats.specialties.push(planet.specialty);
      }
      if (planet.specialty === "space-station") stats.spaceStations.push(planet.name);
    }
    for (const wormhole of tile.wormholes) {
      if (!stats.wormholes.includes(wormhole)) stats.wormholes.push(wormhole);
    }
    for (const anomaly of tile.anomalies) {
      if (!stats.anomalies.includes(anomaly)) stats.anomalies.push(anomaly);
    }
  }
  return stats;
}

export function sliceNotes(stats: SliceStats): string | null {
  const parts = [
    stats.legendary.length ? `Legendary: ${stats.legendary.join(", ")}` : "",
    stats.wormholes.length ? `Wormholes: ${stats.wormholes.map(labelWormhole).join(", ")}` : "",
    stats.anomalies.length ? `Anomalies: ${stats.anomalies.map(labelAnomaly).join(", ")}` : "",
    stats.specialties.length ? `Tech: ${stats.specialties.map(labelSpecialty).join(", ")}` : "",
    stats.spaceStations.length ? `Space station: ${stats.spaceStations.join(", ")}` : "",
    stats.unknown.length ? `Unknown tile: ${stats.unknown.join(", ")}` : "",
    stats.warnings.length ? stats.warnings.join(" ") : "",
  ].filter(Boolean);
  const notes = parts.join(". ");
  return notes ? notes.slice(0, 800) : null;
}

export function parseTileLists(value: string): string[][] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!lines.length) throw new Error("Paste one slice per line.");
  return lines.map((line) => {
    const ids = line
      .split(/[, ]+/)
      .map(normalizeTileId)
      .filter(Boolean);
    if (ids.length === 5) {
      throw new Error(
        `Each line needs four tile numbers, in order: top center, middle center, bottom left, middle right. "${line}" has 5. The fifth tile was not removed. Home systems are reserved and are not entered here.`,
      );
    }
    if (ids.length !== 4) {
      throw new Error(
        `Each line needs four tile numbers, in order: top center, middle center, bottom left, middle right. "${line}" has ${ids.length}.`,
      );
    }
    ids.forEach((id) => resolveSliceTile(id));
    return ids;
  });
}

export function duplicateTileIds(groups: readonly (readonly string[])[]): string[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    for (const raw of group) {
      const id = normalizeTileId(raw);
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}
