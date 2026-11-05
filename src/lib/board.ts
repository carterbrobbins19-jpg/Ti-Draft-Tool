import type { PickRow } from "@/lib/types";

export function seatDraft(picks: PickRow[], playerId: string) {
  const mine = picks
    .filter((pick) => pick.player_id === playerId)
    .sort((a, b) => a.pick_number - b.pick_number);
  return {
    factions: mine.filter((pick) => pick.category === "faction"),
    sliceId: mine.find((pick) => pick.category === "slice")?.slice_id ?? null,
    position: mine.find((pick) => pick.category === "position")?.position_number ?? null,
  };
}
