import { seatDraft } from "@/lib/board";
import { factionName, sliceName } from "@/lib/labels";
import type { DraftRoom } from "@/lib/types";

export function PlayerBoard({
  room,
  activePlayerId,
  latestPickId,
  onSelect,
}: {
  room: DraftRoom;
  activePlayerId: string | null;
  latestPickId?: string | null;
  onSelect?: (playerId: string) => void;
}) {
  const latest = room.picks.find((pick) => pick.id === latestPickId);
  const players = [...room.players].sort((a, b) => a.draft_order - b.draft_order);
  const rows = players.map((player) => {
    const seat = seatDraft(room.picks, player.id);
    const complete = seat.factions.length >= 2 && Boolean(seat.sliceId) && Boolean(seat.position);
    return {
      player,
      faction1: factionName(room.factions, seat.factions[0]?.faction_id ?? null),
      faction2: factionName(room.factions, seat.factions[1]?.faction_id ?? null),
      slice: sliceName(room.slices, seat.sliceId),
      position: seat.position ? String(seat.position) : "—",
      active: player.id === activePlayerId,
      joined: Boolean(player.user_id),
      complete,
      fresh: player.id === latest?.player_id,
      canHighlight: Boolean(seat.sliceId && seat.position),
    };
  });

  return (
    <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-3 sm:p-4">
      <h2 className="px-1 font-display text-lg text-[#e4c27a]">Players</h2>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <article
            key={row.player.id}
            className={`rounded-2xl border p-3 ${row.active ? "border-[#e4c27a] bg-[#e4c27a]/10" : "border-white/10 bg-[#0c1222]"} ${row.fresh ? "pick-flash" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-left font-semibold disabled:cursor-default"
                disabled={!onSelect || !row.canHighlight}
                onClick={() => onSelect?.(row.player.id)}
              >
                {row.player.name}
              </button>
              <span className="text-xs text-white/50">{row.complete ? "Complete" : row.joined ? "Drafting" : "Invite open"}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Cell label="Faction A" value={row.faction1} />
              <Cell label="Faction B" value={row.faction2} />
              <Cell label="Slice" value={row.slice} />
              <Cell label="Position" value={row.position} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
