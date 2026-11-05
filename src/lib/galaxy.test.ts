import { describe, expect, it } from "vitest";
import {
  GALAXY,
  HEX_SIZE,
  axialKey,
  hexDistance,
  hexPixel,
  isOuterCorner,
  placeGalaxy,
  ringOf,
  sampleSeats,
} from "@/lib/galaxy";

describe("galaxy geometry", () => {
  it("contains 37 unique hexes with Mecatol in the center", () => {
    expect(GALAXY).toHaveLength(37);
    expect(new Set(GALAXY.map(axialKey)).size).toBe(37);
    const mecatol = GALAXY.filter((hex) => hex.role === "mecatol");
    expect(mecatol).toEqual([expect.objectContaining({ q: 0, r: 0, position: null })]);
    expect(ringOf(mecatol[0]!)).toBe(0);
  });

  it("gives each position six hexes and covers every ring without gaps", () => {
    for (const position of [1, 2, 3, 4, 5, 6]) {
      expect(GALAXY.filter((hex) => hex.position === position)).toHaveLength(6);
    }
    const expected = new Set<string>(["0,0"]);
    for (let q = -3; q <= 3; q += 1) {
      for (let r = -3; r <= 3; r += 1) {
        const distance = hexDistance({ q, r }, { q: 0, r: 0 });
        if (distance >= 1 && distance <= 3) expected.add(`${q},${r}`);
      }
    }
    expect(new Set(GALAXY.map(axialKey))).toEqual(expected);
  });

  it("keeps homes on the outer corners and minor homes on the second ring", () => {
    const homes = GALAXY.filter((hex) => hex.role === "main");
    const minors = GALAXY.filter((hex) => hex.role === "minor");
    expect(homes).toHaveLength(6);
    expect(minors).toHaveLength(6);
    expect(homes.every(isOuterCorner)).toBe(true);
    const homeAt = (position: number) => homes.find((hex) => hex.position === position)!;
    expect(hexPixel(homeAt(1).q, homeAt(1).r).y).toBeLessThan(hexPixel(homeAt(4).q, homeAt(4).r).y);
    expect(hexPixel(homeAt(1).q, homeAt(1).r).x).toBeLessThan(hexPixel(homeAt(2).q, homeAt(2).r).x);
    expect(hexPixel(homeAt(6).q, homeAt(6).r).x).toBeLessThan(hexPixel(homeAt(3).q, homeAt(3).r).x);
    expect(minors.every((hex) => ringOf(hex) === 2)).toBe(true);
    for (const position of [1, 2, 3, 4, 5, 6]) {
      const slice = GALAXY.filter((hex) => hex.position === position);
      const slot = (index: number) => slice.find((hex) => hex.slot === index)!;
      expect(ringOf(slot(0))).toBe(1);
      expect(ringOf(slot(1))).toBe(2);
      expect(ringOf(slot(2))).toBe(3);
      expect(ringOf(slot(3))).toBe(3);
      const main = slice.find((hex) => hex.role === "main")!;
      const minor = slice.find((hex) => hex.role === "minor")!;
      expect(hexDistance(main, slot(1))).toBe(1);
      expect(hexDistance(main, slot(2))).toBe(1);
      expect(hexDistance(main, slot(3))).toBe(1);
      expect(hexDistance(main, minor)).toBeGreaterThan(1);
      expect(hexDistance(minor, slot(0))).toBe(1);
      expect(hexDistance(minor, slot(1))).toBe(1);
      expect(hexDistance(minor, slot(2))).toBe(1);
    }
  });

  it("aligns neighbors edge to edge and leaves no closer pairs", () => {
    const spacing = HEX_SIZE * Math.sqrt(3);
    let nearest = Number.POSITIVE_INFINITY;
    for (let left = 0; left < GALAXY.length; left += 1) {
      for (let right = left + 1; right < GALAXY.length; right += 1) {
        const a = GALAXY[left]!;
        const b = GALAXY[right]!;
        const pixels = Math.hypot(hexPixel(a.q, a.r).x - hexPixel(b.q, b.r).x, hexPixel(a.q, a.r).y - hexPixel(b.q, b.r).y);
        nearest = Math.min(nearest, pixels);
        if (hexDistance(a, b) === 1) expect(pixels).toBeCloseTo(spacing, 5);
      }
    }
    expect(nearest).toBeCloseTo(spacing, 5);
  });
});

describe("draft placement", () => {
  it("fills a position only after both the slice and the position are known", () => {
    const seats = sampleSeats().map((seat) => (seat.position === 3 ? { ...seat, tileIds: ["19", "32", "115", "31"], sliceName: "Jericho" } : { ...seat, tileIds: [], sliceName: null, playerName: null }));
    const placed = placeGalaxy(seats);
    const jericho = placed.filter((hex) => hex.position === 3 && hex.role === "system").sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    expect(jericho.map((hex) => hex.tileId)).toEqual(["19", "32", "115", "31"]);
    expect(placed.find((hex) => hex.position === 1 && hex.role === "system")?.tileId).toBeNull();
    expect(placed.find((hex) => hex.position === 3 && hex.role === "main")?.playerName).toBe("Player 3");
  });

  it("keeps a drafted slice off the map until that player has a position", () => {
    const waiting = placeGalaxy(sampleSeats().map((seat) => ({ ...seat, playerName: null, sliceName: null, tileIds: [] })));
    expect(waiting.filter((hex) => hex.role === "system" && hex.tileId)).toHaveLength(0);
    expect(waiting.filter((hex) => hex.playerName)).toHaveLength(0);
  });

  it("puts the opposite player's minor faction on the red home", () => {
    const placed = placeGalaxy(sampleSeats());
    const carterHome = placed.find((hex) => hex.position === 1 && hex.role === "main");
    const oppositeMinor = placed.find((hex) => hex.position === 4 && hex.role === "minor");
    const ownMinor = placed.find((hex) => hex.position === 1 && hex.role === "minor");
    expect(carterHome?.factionName).toBe("Federation of Sol");
    expect(carterHome?.homeTileId).toBe("1");
    expect(oppositeMinor?.factionName).toBe("Hacan");
    expect(oppositeMinor?.homeTileId).toBe("16");
    expect(ownMinor?.factionName).toBeNull();
  });

  it("fills all six sample slices without overlapping systems", () => {
    const placed = placeGalaxy(sampleSeats());
    const systems = placed.filter((hex) => hex.role === "system" && hex.tileId);
    expect(systems).toHaveLength(24);
    expect(new Set(systems.map((hex) => hex.tileId)).size).toBe(24);
    expect(new Set(placed.map(axialKey)).size).toBe(37);
  });
});
