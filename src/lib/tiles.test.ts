import { describe, expect, it } from "vitest";
import { isRoomCode, normalizeRoomCode } from "@/lib/lobby";
import { homesForSeat, minorFactionAcrossFrom } from "@/lib/slice-homes";
import {
  SLICE_LAYOUT,
  buildSliceStats,
  duplicateTileIds,
  formatStat,
  homeTileForFaction,
  incompleteSliceMessage,
  lookupTile,
  optimalPlanet,
  parseTileLists,
  readStoredTiles,
  resolveSliceTile,
} from "@/lib/tiles";

describe("room codes", () => {
  it("accepts a shared code and rejects a private invite token", () => {
    expect(normalizeRoomCode(" x7k9p2 ")).toBe("X7K9P2");
    expect(isRoomCode("x7k9p2")).toBe(true);
    expect(isRoomCode("ABCD1234")).toBe(true);
    expect(isRoomCode("a".repeat(64))).toBe(false);
  });
});

describe("tile lookup", () => {
  it("resolves tile 35 to Bereg and Lirta IV", () => {
    const tile = lookupTile("35");
    expect(tile?.planets.map((planet) => [planet.name, planet.resources, planet.influence])).toEqual([
      ["Bereg", 3, 1],
      ["Lirta IV", 2, 3],
    ]);
    const stats = buildSliceStats(["35"]);
    expect(stats.resources).toBe(5);
    expect(stats.influence).toBe(4);
    expect(stats.optimalResources).toBe(3);
    expect(stats.optimalInfluence).toBe(3);
  });

  it("keeps alphanumeric ids and does not invent missing ones", () => {
    expect(lookupTile("83a")?.kind).toBe("hyperlane");
    expect(lookupTile("82A")).toBeNull();
    expect(buildSliceStats(["82A"]).unknown).toEqual(["82A"]);
  });

  it("counts Wellon's cybernetic specialty without treating Mecatol as a normal system", () => {
    expect(buildSliceStats(["19"]).specialties).toEqual(["cybernetic"]);
    expect(buildSliceStats(["18"]).warnings.join(" ")).toMatch(/Mecatol/i);
  });
});

describe("four-tile slice layout", () => {
  it("draws six hexes and lets the host edit only four", () => {
    expect(SLICE_LAYOUT).toHaveLength(6);
    expect(SLICE_LAYOUT.filter((cell) => cell.editable)).toHaveLength(4);
    const byId = Object.fromEntries(SLICE_LAYOUT.map((cell) => [cell.id, cell]));
    expect(byId.top?.row).toBeLessThan(byId.middle?.row ?? 0);
    expect(byId.minor?.col).toBeLessThan(byId.middle?.col ?? 0);
    expect(byId.minor?.row).toBe(byId.middle?.row);
    expect(byId.right?.col).toBeGreaterThan(byId.middle?.col ?? 0);
    expect(byId["bottom-left"]?.row).toBeGreaterThan(byId.middle?.row ?? 0);
    expect(byId.main?.row).toBe(byId["bottom-left"]?.row);
    expect(byId.main?.col).toBeGreaterThan(byId["bottom-left"]?.col ?? 0);
    expect(byId.minor?.editable).toBe(false);
    expect(byId.main?.editable).toBe(false);
  });

  it("keeps four comma-separated tiles in top, middle, bottom-left, right order", () => {
    expect(parseTileLists("19,32,115,31\n26 29 30 37")).toEqual([
      ["19", "32", "115", "31"],
      ["26", "29", "30", "37"],
    ]);
  });

  it("refuses a fifth tile instead of dropping it", () => {
    expect(() => parseTileLists("19,32,115,31,67")).toThrow(/fifth tile was not removed/i);
  });

  it("rejects unknown and non-system tile numbers", () => {
    expect(() => resolveSliceTile("82A")).toThrow(/not in the catalog/i);
    expect(() => resolveSliceTile("18")).toThrow(/not a normal system/i);
    expect(incompleteSliceMessage("Slice 1", ["19", "32", "", ""])).toMatch(/exactly four/);
    expect(incompleteSliceMessage("Slice 1", ["", "", "", ""])).toBeNull();
  });

  it("keeps an older five-tile list intact", () => {
    expect(readStoredTiles(["19", "32", "115", "31", "67"])).toEqual({
      slots: ["", "", "", ""],
      legacy: ["19", "32", "115", "31", "67"],
    });
  });

  it("leaves home systems out of slice statistics", () => {
    const stats = buildSliceStats(["35", "19", "32", "31"]);
    expect(stats.planets).toContain("Bereg");
    expect(stats.planets).not.toContain("Jord");
    expect(homeTileForFaction("Federation of Sol")?.id).toBe("1");
    expect(homeTileForFaction("Hacan")?.id).toBe("16");
    expect(homeTileForFaction("Keleres")).toBeNull();
    expect(homeTileForFaction("Ral Nel")).toBeNull();
  });
});

describe("minor faction homes", () => {
  const seats = [
    { position: 1, minorFaction: "Ral Nel" },
    { position: 4, minorFaction: "Hacan" },
  ];

  it("puts the main faction on green and the opposite minor on red", () => {
    const carter = homesForSeat({
      revealed: true,
      position: 1,
      mainFaction: "Keleres",
      oppositeMinorFaction: minorFactionAcrossFrom(1, seats),
    });
    const opposite = homesForSeat({
      revealed: true,
      position: 4,
      mainFaction: "Hacan",
      oppositeMinorFaction: minorFactionAcrossFrom(4, seats),
    });
    expect(carter.main.factionName).toBe("Keleres");
    expect(carter.main.role).toBe("main");
    expect(carter.minor.factionName).toBe("Hacan");
    expect(opposite.minor.factionName).toBe("Ral Nel");
    expect(carter.minor.factionName).not.toBe("Ral Nel");
  });

  it("keeps the same assignment when the saved result is read again", () => {
    const input = {
      revealed: true,
      position: 1,
      mainFaction: "Keleres",
      oppositeMinorFaction: "Hacan",
    };
    expect(homesForSeat(input)).toEqual(homesForSeat(input));
    expect(homesForSeat({ ...input, revealed: false }).main.subtitle).toBe("Awaiting reveal");
    expect(homesForSeat({ ...input, revealed: false }).minor.subtitle).toBe("Awaiting reveal");
  });
});

describe("slice order and optimal value", () => {

  it("uses the higher planet value, and splits ties in half", () => {
    expect(optimalPlanet(3, 1)).toEqual({ resources: 3, influence: 0 });
    expect(optimalPlanet(1, 2)).toEqual({ resources: 0, influence: 2 });
    expect(optimalPlanet(1, 1)).toEqual({ resources: 0.5, influence: 0.5 });
    expect(formatStat(3.5)).toBe("3.5");
  });

  it("finds a tile used in more than one slice", () => {
    expect(duplicateTileIds([["19", "20"], ["21", "19"]])).toEqual(["19"]);
    expect(duplicateTileIds([["19", ""], ["20"]])).toEqual([]);
  });
});
