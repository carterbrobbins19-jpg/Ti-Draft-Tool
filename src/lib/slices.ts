import type { FactionDraft, SliceDraft } from "@/lib/types";

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function wholeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 40) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed <= 40) return parsed;
  }
  return null;
}

function planetName(value: unknown): { name: string; resources: number; influence: number; legendary: boolean } | null {
  if (typeof value === "string" && value.trim()) {
    return { name: value.trim(), resources: 0, influence: 0, legendary: false };
  }
  const row = record(value);
  if (!row) return null;
  const name = text(row.name);
  if (!name) return null;
  return {
    name,
    resources: wholeNumber(row.resources ?? row.resource) ?? 0,
    influence: wholeNumber(row.influence) ?? 0,
    legendary: row.legendary === true,
  };
}

export function parseSliceImport(raw: unknown): SliceDraft[] {
  const wrapper = record(raw);
  const source = Array.isArray(raw) ? raw : wrapper?.slices ?? wrapper?.slice ?? null;
  if (!Array.isArray(source)) {
    throw new Error("Slice JSON must be an array, or an object with a slices array");
  }

  return source.map((entry, index) => {
    const row = record(entry);
    if (!row) throw new Error(`Slice ${index + 1} is not an object`);
    const name = text(row.name ?? row.sliceName ?? row.slice_name) || `Slice ${index + 1}`;
    const planetRows = Array.isArray(row.planets) ? row.planets.map(planetName).filter((planet) => planet !== null) : [];
    const planets = planetRows.map((planet) => planet.name);
    const resourceFallback = planetRows.reduce((sum, planet) => sum + planet.resources, 0);
    const influenceFallback = planetRows.reduce((sum, planet) => sum + planet.influence, 0);
    const resourceInput = row.total_resources ?? row.totalResources ?? row.resources;
    const influenceInput = row.total_influence ?? row.totalInfluence ?? row.influence;
    const totalResources = resourceInput === undefined ? null : wholeNumber(resourceInput);
    const totalInfluence = influenceInput === undefined ? null : wholeNumber(influenceInput);
    if (resourceInput !== undefined && totalResources === null) throw new Error(`${name} has invalid resources`);
    if (influenceInput !== undefined && totalInfluence === null) throw new Error(`${name} has invalid influence`);
    const legendary = [
      ...planetRows.filter((planet) => planet.legendary).map((planet) => planet.name),
      ...(Array.isArray(row.legendary) ? row.legendary.map(text).filter(Boolean) : []),
    ];
    const notes = [
      text(row.special_notes ?? row.specialNotes ?? row.notes ?? row.special),
      legendary.length ? `Legendary: ${Array.from(new Set(legendary)).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". ");
    const image = text(row.image_url ?? row.imageUrl ?? row.image);

    return {
      name,
      image_url: image || null,
      planets,
      total_resources: totalResources ?? resourceFallback,
      total_influence: totalInfluence ?? influenceFallback,
      special_notes: notes || null,
    };
  });
}

export function parseFactionLines(value: string): FactionDraft[] {
  const factions: FactionDraft[] = [];
  const seen = new Set<string>();
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [namePart, expansionPart, imagePart] = trimmed.split("|");
    const name = namePart?.trim() ?? "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate faction: ${name}`);
    seen.add(key);
    const image = imagePart?.trim() ?? "";
    factions.push({
      name,
      expansion: expansionPart?.trim() || null,
      image_url: image || null,
    });
  }
  return factions;
}

export function formatFactionLines(factions: FactionDraft[]): string {
  return factions
    .map((faction) => {
      const parts = [faction.name, faction.expansion ?? "", faction.image_url ?? ""];
      while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
      return parts.join(" | ");
    })
    .join("\n");
}
