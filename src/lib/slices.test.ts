import { describe, expect, it } from "vitest";
import { formatFactionLines, parseFactionLines, parseSliceImport } from "@/lib/slices";

describe("slice import", () => {
  it("reads a wrapped list and sums planet objects when totals are omitted", () => {
    const slices = parseSliceImport({
      slices: [
        {
          name: "Slice A",
          planets: [
            { name: "Wellon", resources: 1, influence: 2, legendary: true },
            { name: "Vefut II", resources: 2, influence: 2 },
          ],
          notes: "Imported",
        },
      ],
    });
    expect(slices[0]).toMatchObject({
      name: "Slice A",
      planets: ["Wellon", "Vefut II"],
      total_resources: 3,
      total_influence: 4,
    });
    expect(slices[0]?.special_notes).toContain("Legendary: Wellon");
    expect(slices[0]?.special_notes).toContain("Imported");
  });

  it("rejects a file without a slice list", () => {
    expect(() => parseSliceImport({ name: "Slice A" })).toThrow(/slices array/i);
  });

  it("imports four tile numbers in order and refuses a fifth", () => {
    const slices = parseSliceImport({
      slices: [{ name: "Slice A", tiles: ["19", "32", "115", "31"] }],
    });
    expect(slices[0]?.tile_ids).toEqual(["19", "32", "115", "31"]);
    expect(slices[0]?.planets).toContain("Wellon");
    expect(() => parseSliceImport({ slices: [{ name: "Slice A", tiles: ["19", "32", "115", "31", "67"] }] })).toThrow(/not removed/i);
  });
});

describe("faction lines", () => {
  it("round-trips names, expansions, and images", () => {
    const text = formatFactionLines([
      { name: "Hacan", expansion: "Base", image_url: null },
      { name: "Keleres", expansion: "Codex", image_url: "https://example.com/k.png" },
    ]);
    expect(parseFactionLines(text)).toEqual([
      { name: "Hacan", expansion: "Base", image_url: null },
      { name: "Keleres", expansion: "Codex", image_url: "https://example.com/k.png" },
    ]);
  });
});
