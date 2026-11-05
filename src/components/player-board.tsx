import { seatDraft } from "@/lib/board";
import { factionName, sliceName } from "@/lib/labels";
import type { DraftRoom } from "@/lib/types";

export function PlayerBoard({ room, activePlayerId }: { room: DraftRoom; activePlayerId: string | null }) {
  const players = [...room.players].sort((a, b) => a.draft_order - b.draft_order);
  const rows = players.map((player) => {
    const seat = seatDraft(room.picks, player.id);
    return {
      player,
      faction1: factionName(room.factions, seat.factions[0]?.faction_id ?? null),
      faction2: factionName(room.factions, seat.factions[1]?.faction_id ?? null),
      slice: sliceName(room.slices, seat.sliceId),
      position: seat.position ? String(seat.position) : "—",
      active: player.id === activePlayerId,
      joined: Boolean(player.user_id),
    };
  });

  return (
    <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-3 sm:p-4">
      <h2 className="px-1 font-display text-lg text-[#e4c27a]">Draft board</h2>
      <div className="mt-3 space-y-3 md:hidden">
        {rows.map((row) => (
          <article
            key={row.player.id}
            className={`rounded-2xl border p-3 ${row.active ? "border-[#e4c27a] bg-[#e4c27a]/10" : "border-white/10 bg-[#0c1222]"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{row.player.name}</h3>
              <span className="text-xs text-white/50">{row.joined ? "Joined" : "Invite open"}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Cell label="Faction 1" value={row.faction1} />
              <Cell label="Faction 2" value={row.faction2} />
              <Cell label="Slice" value={row.slice} />
              <Cell label="Position" value={row.position} />
            </dl>
          </article>
        ))}
      </div>
      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] border-separate border-spacing-y-2 text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-white/45">
            <tr>
              <th className="px-3">Player</th>
              <th className="px-3">Faction 1</th>
              <th className="px-3">Faction 2</th>
              <th className="px-3">Slice</th>
              <th className="px-3">Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player.id} className={row.active ? "bg-[#e4c27a]/15 text-[#f6edd8]" : "bg-[#0c1222]"}>
                <td className="rounded-l-xl px-3 py-3 font-semibold">{row.player.name}</td>
                <td className="px-3 py-3">{row.faction1}</td>
                <td className="px-3 py-3">{row.faction2}</td>
                <td className="px-3 py-3">{row.slice}</td>
                <td className="rounded-r-xl px-3 py-3">{row.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
