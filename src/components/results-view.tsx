"use client";

import { useState } from "react";
import { GalaxyMap } from "@/components/galaxy-map";
import { HostMenu } from "@/components/host-menu";
import { LegacyTileNote, SliceMap, SliceSummary, TileDetail } from "@/components/slice-view";
import { Button } from "@/components/ui";
import { recordFactionAssignments } from "@/lib/api";
import { seatDraft } from "@/lib/board";
import { oppositePosition } from "@/lib/draft-rules";
import { errorMessage } from "@/lib/errors";
import { seatsFromRoom } from "@/lib/galaxy";
import { factionName, sliceName } from "@/lib/labels";
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
  const revealed = room.draft.status === "revealed";
  const players = [...room.players].sort((a, b) => a.draft_order - b.draft_order);
  const isHost = room.draft.host_user_id === room.userId;
  const seats = seatsFromRoom(room);

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-[#e4c27a]/30 bg-[#12182a]/90 p-5 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-[#e4c27a]">{revealed ? "Factions recorded" : "Draft complete"}</p>
        <h1 className="mt-2 font-display text-3xl">
          {revealed ? "Main and minor factions" : "Draft Complete — Faction assignments will be determined on game day."}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/70">
          {revealed
            ? "These faction roles are published. Refreshing this page will not change them."
            : "Every player has two factions, one slice, and one position. Neither faction is the main or minor faction until the host publishes the physical coin flips."}
        </p>
      </section>

      <GalaxyMap seats={seats} />
      {isHost && !revealed ? <AssignmentForm room={room} refresh={refresh} report={report} /> : null}

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
                      : "This home is reserved until faction assignments are recorded.",
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

function AssignmentForm({
  room,
  refresh,
  report,
}: {
  room: DraftRoom;
  refresh: () => Promise<void>;
  report: (message: string | null) => void;
}) {
  const players = [...room.players].sort((a, b) => a.draft_order - b.draft_order);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ready = players.every((player) => {
    const seat = seatDraft(room.picks, player.id);
    return seat.factions.some((pick) => pick.faction_id === choices[player.id]);
  });

  async function publish() {
    if (!ready) return;
    if (!window.confirm("Publish these faction assignments? They are saved and will not change.")) return;
    setBusy(true);
    report(null);
    try {
      await recordFactionAssignments(
        room.draft.id,
        players.map((player) => ({ player_id: player.id, main_faction_id: choices[player.id] ?? "" })),
      );
      await refresh();
    } catch (error) {
      report(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
      <h2 className="font-display text-xl text-[#e4c27a]">Record faction assignments</h2>
      <p className="mt-2 text-sm leading-6 text-white/70">
        Choose the main faction from each player&apos;s two drafted factions. The other becomes the minor faction. Nothing is published until all six are confirmed.
      </p>
      <div className="mt-4 grid gap-3">
        {players.map((player) => {
          const seat = seatDraft(room.picks, player.id);
          return (
            <label key={player.id} className="grid gap-2 rounded-2xl bg-black/20 p-3 text-sm">
              <span className="font-semibold">{player.name}</span>
              <select
                className="min-h-12 rounded-xl border border-white/15 bg-[#070b14] px-3 text-base"
                value={choices[player.id] ?? ""}
                onChange={(event) => setChoices((current) => ({ ...current, [player.id]: event.target.value }))}
              >
                <option value="">Choose the main faction</option>
                {seat.factions.map((pick) => (
                  <option key={pick.faction_id} value={pick.faction_id ?? ""}>
                    {factionName(room.factions, pick.faction_id)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <Button className="mt-4 w-full sm:w-auto" disabled={!ready || busy} onClick={() => void publish()}>
        {busy ? "Publishing..." : "Publish assignments"}
      </Button>
    </section>
  );
}

function Result({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-3 ${emphasis ? "bg-[#e4c27a]/15" : "bg-black/20"}`}>
      <dt className="text-[10px] uppercase tracking-[0.16em] text-white/45">{label}</dt>
      <dd className={`mt-1 font-semibold ${emphasis ? "text-[#f3dfb0]" : ""}`}>{value}</dd>
    </div>
  );
}
