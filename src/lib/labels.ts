import type { FactionRow, PickRow, SliceRow } from "@/lib/types";

const ACCENTS = ["#e4c27a", "#8b7cff", "#6cb6ff", "#e08bb8", "#7dcea0", "#f0a36b"];

export function accentFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export function factionName(factions: FactionRow[], id: string | null): string {
  if (!id) return "—";
  return factions.find((faction) => faction.id === id)?.name ?? "—";
}

export function sliceName(slices: SliceRow[], id: string | null): string {
  if (!id) return "—";
  return slices.find((slice) => slice.id === id)?.name ?? "—";
}

export function describePick(pick: PickRow, factions: FactionRow[], slices: SliceRow[]): string {
  if (pick.category === "faction") return factionName(factions, pick.faction_id);
  if (pick.category === "slice") return sliceName(slices, pick.slice_id);
  return `Position ${pick.position_number ?? "—"}`;
}

export function choiceLabel(
  choice: { category: "faction" | "slice" | "position"; factionId?: string; sliceId?: string; position?: number },
  factions: FactionRow[],
  slices: SliceRow[],
): string {
  if (choice.category === "faction") return factionName(factions, choice.factionId ?? null);
  if (choice.category === "slice") return sliceName(slices, choice.sliceId ?? null);
  return `Position ${choice.position ?? "—"}`;
}
