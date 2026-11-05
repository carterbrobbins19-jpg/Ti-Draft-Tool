"use client";

import { useState } from "react";
import { HexTable } from "@/components/hex-table";
import { HostMenu } from "@/components/host-menu";
import { LegacyTileNote, SliceMap, SliceSummary, TileDetail } from "@/components/slice-view";
import { Button } from "@/components/ui";
import { seatDraft } from "@/lib/board";
import { oppositePosition } from "@/lib/draft-rules";
import { errorMessage } from "@/lib/errors";
import { factionName, sliceName } from "@/lib/labels";
import { revealFactions } from "@/lib/api";
import { homesForSeat, minorFactionAcrossFrom } from "@/lib/slice-homes";
import { lookupTile, readStoredTiles } from "@/lib/tiles";
import type { DraftRoom, PlayerRow } from "@/lib/types";

export function ResultsView({
  room,
  animate,
  refresh,
  report,
}: {
  room: DraftRoom;
  animate: boolean;
  refresh: () => Promise<void>;
  report: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const revealed = room.draft.status === "revealed";
  const players = [...room.players].sort((a, b) => a.draft_order - b.draft_order);
  const isHost = room.draft.host_user_id === room.userId;

  async function reveal() {
    if (!window.confirm("Reveal main and minor factions? The coin flips are saved and will not change.")) return;
    setBusy(true);
    report(null);
    try {
      await revealFactions(room.draft.id);
      await refresh();
    } catch (error) {
      report(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-[#e4c27a]/30 bg-[#12182a]/90 p-5 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[#e4c27a]">{revealed ? "Factions revealed" : "Draft complete"}</p>
        <h1 className="mt-2 font-display text-3xl">{revealed ? "Main and minor factions" : "Roles are still hidden"}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/70">
          {revealed
            ? "Each coin flip was rolled once on the server. Reloading this page will not change it."
            : "Every player has two factions, one slice, and one position. The host reveals which faction is played."}
        </p>
        {isHost && !revealed ? (
          <Button className="mt-4 w-full sm:w-auto" disabled={busy} onClick={() => void reveal()}>
            {busy ? "Revealing..." : "Reveal factions"}
          </Button>
        ) : null}
      </section>

      {revealed ? (
        <HexTable
          seats={[1, 2, 3, 4, 5, 6].map((position) => {
            const seated = players.find((player) => seatDraft(room.picks, player.id).position === position);
            const minorOwner = players.find((player) => seatDraft(room.picks, player.id).position === oppositePosition(position));
            return {
              position,
              title: seated?.name ?? "Empty",
              subtitle: seated ? factionName(room.factions, seated.main_faction_id) : undefined,
              note: minorOwner ? `Minor: ${factionName(room.factions, minorOwner.minor_faction_id)}` : undefined,
              taken: true,
            };
          })}
        />
      ) : null}

      <div className="grid gap-3">
        {players.map((player, index) => (
          <PlayerResult key={player.id} room={room} player={player} revealed={revealed} animate={animate} delay={index * 90} />
        ))}
      </div>
      <HostMenu room={room} refresh={refresh} report={report} />
    </div>
  );
}

function PlayerResult({
  room,
  player,
  revealed,
  animate,
  delay,
}: {
  room: DraftRoom;
  player: PlayerRow;
  revealed: boolean;
  animate: boolean;
  delay: number;
}) {
  const [openTile, setOpenTile] = useState<{ tileId: string; heading?: string; emptyNote?: string } | null>(null);
  const seat = seatDraft(room.picks, player.id);
  const factionA = factionName(room.factions, seat.factions[0]?.faction_id ?? null);
  const factionB = factionName(room.factions, seat.factions[1]?.faction_id ?? null);
  const slice = room.slices.find((entry) => entry.id === seat.sliceId) ?? null;
  const opposite = seat.position ? oppositePosition(seat.position) : null;
  const revealedNames = revealed
    ? seatsForHomes(room)
    : [];
  const oppositeMinor = seat.position ? minorFactionAcrossFrom(seat.position, revealedNames) : null;
  const homes = homesForSeat({
    revealed,
    position: seat.position,
    mainFaction: cleanName(factionName(room.factions, player.main_faction_id)),
    oppositeMinorFaction: cleanName(oppositeMinor),
  });
  const stored = readStoredTiles(Array.isArray(slice?.tile_ids) ? slice.tile_ids : []);

  return (
    <article
      className={`rounded-3xl border border-white/10 bg-[#12182a]/90 p-4 ${animate && revealed ? "coin-flip" : ""}`}
      style={animate && revealed ? { animationDelay: `${delay}ms` } : undefined}
    >
      <h2 className="font-display text-2xl">{player.name}</h2>
      {revealed ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Result label="Main faction" value={factionName(room.factions, player.main_faction_id)} emphasis />
          <Result label="Minor faction" value={factionName(room.factions, player.minor_faction_id)} />
          <Result label="Slice" value={sliceName(room.slices, seat.sliceId)} />
          <Result label="Position" value={seat.position ? String(seat.position) : "—"} />
          <Result
            label="Minor faction location"
            value={opposite ? `Position ${opposite} (opposite ${seat.position})` : "—"}
          />
        </dl>
      ) : (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Result label="Faction A" value={factionA} />
          <Result label="Faction B" value={factionB} />
          <Result label="Slice" value={sliceName(room.slices, seat.sliceId)} />
          <Result label="Position" value={seat.position ? String(seat.position) : "—"} />
        </dl>
      )}
      {slice ? (
        <div className="mt-3">
          <SliceMap
            tileIds={stored.slots}
            homes={homes}
            blankLabel={stored.legacy ? "Older list" : "Empty"}
            onInspect={(detail) =>
              setOpenTile({
                tileId: detail.tileId,
                heading: detail.factionName ?? (detail.role === "main" ? homes.main.title : detail.role === "minor" ? homes.minor.title : undefined),
                emptyNote:
                  detail.role === "system"
                    ? undefined
                    : detail.factionName
                      ? "This faction's home system is not in the local catalog. Only the name is shown."
                      : "This home is reserved until the host reveals main and minor factions.",
              })
            }
          />
          {stored.legacy ? <LegacyTileNote tileIds={stored.legacy} onOpen={(tileId) => setOpenTile({ tileId })} /> : null}
          <SliceSummary
            tileIds={(stored.legacy ?? stored.slots).some(Boolean) ? (stored.legacy ?? stored.slots) : []}
            resources={slice.total_resources}
            influence={slice.total_influence}
            legacy={Boolean(stored.legacy)}
          />
          {openTile ? (
            <TileDetail
              tileId={openTile.tileId}
              tile={openTile.tileId ? lookupTile(openTile.tileId) : null}
              heading={openTile.heading}
              emptyNote={openTile.emptyNote}
              onClose={() => setOpenTile(null)}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function cleanName(value: string | null): string | null {
  if (!value || value === "—") return null;
  return value;
}

function seatsForHomes(room: DraftRoom) {
  return room.players.map((player) => ({
    position: seatDraft(room.picks, player.id).position ?? 0,
    minorFaction: cleanName(factionName(room.factions, player.minor_faction_id)),
  }));
}

function Result({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-3 ${emphasis ? "bg-[#e4c27a]/15" : "bg-black/20"}`}>
      <dt className="text-[10px] uppercase tracking-[0.16em] text-white/45">{label}</dt>
      <dd className={`mt-1 font-semibold ${emphasis ? "text-[#f3dfb0]" : ""}`}>{value}</dd>
    </div>
  );
}
