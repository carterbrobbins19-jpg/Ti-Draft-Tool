"use client";

import { useMemo, useState } from "react";
import { ChoicePanel } from "@/components/choice-panel";
import { GalaxyMap } from "@/components/galaxy-map";
import { HostMenu } from "@/components/host-menu";
import { PlayerBoard } from "@/components/player-board";
import { SliceMap, SliceSummary } from "@/components/slice-view";
import { Button } from "@/components/ui";
import { submitPick } from "@/lib/api";
import { seatDraft } from "@/lib/board";
import { describePick } from "@/lib/labels";
import { currentTurn, displayProgress, roomToEngine, upcomingTurn } from "@/lib/draft-rules";
import { errorMessage } from "@/lib/errors";
import { seatsFromRoom } from "@/lib/galaxy";
import { awaitingHomes } from "@/lib/slice-homes";
import { readStoredTiles } from "@/lib/tiles";
import type { DraftRoom, PickChoice } from "@/lib/types";

export function LiveDraft({
  room,
  refresh,
  report,
}: {
  room: DraftRoom;
  refresh: () => Promise<void>;
  report: (message: string | null) => void;
}) {
  const turnKey = `${room.draft.status}:${room.draft.next_pick}`;
  const [pendingState, setPendingState] = useState<{ key: string; choice: PickChoice | null }>({
    key: turnKey,
    choice: null,
  });
  const pending = pendingState.key === turnKey ? pendingState.choice : null;
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"draft" | "map">("draft");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const engine = useMemo(() => roomToEngine(room), [room]);
  const seats = useMemo(() => seatsFromRoom(room), [room]);
  const turn = currentTurn(engine);
  const upcoming = upcomingTurn(engine);
  const progress = displayProgress(engine);
  const yourTurn = room.draft.status === "active" && turn?.userId === room.userId;
  const recent = [...room.picks].sort((a, b) => b.pick_number - a.pick_number).slice(0, 6);
  const latest = recent[0];
  const preview = previewId ? (room.slices.find((slice) => slice.id === previewId) ?? null) : null;
  const previewTiles = readStoredTiles(Array.isArray(preview?.tile_ids) ? preview.tile_ids : []);

  function choose(choice: PickChoice) {
    setPendingState({ key: turnKey, choice });
  }

  function viewSlice(sliceId: string) {
    const owner = room.picks.find((pick) => pick.slice_id === sliceId);
    const position = owner ? seatDraft(room.picks, owner.player_id).position : null;
    setHighlight(position);
    setPreviewId(position ? null : sliceId);
    setPanel("map");
  }

  function viewPlayer(playerId: string) {
    const seat = seatDraft(room.picks, playerId);
    if (!seat.position || !seat.sliceId) return;
    setHighlight(seat.position);
    setPreviewId(null);
    setPanel("map");
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    report(null);
    try {
      const item =
        pending.category === "faction"
          ? pending.factionId
          : pending.category === "slice"
            ? pending.sliceId
            : String(pending.position);
      await submitPick(room.draft.id, pending.category, item);
      setPendingState({ key: turnKey, choice: null });
      await refresh();
    } catch (error) {
      report(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section
        className={`rounded-3xl px-4 py-5 text-center ${
          yourTurn ? "bg-gradient-to-r from-[#e4c27a] to-[#f6e7c1] text-[#1a1204]" : "border border-[#8b7cff]/30 bg-[#8b7cff]/10"
        }`}
      >
        <p className="font-display text-2xl tracking-wide sm:text-3xl">
          {room.draft.status === "paused"
            ? "Draft paused"
            : yourTurn
              ? "IT'S YOUR TURN!"
              : `Waiting for ${turn?.name ?? "the next player"}...`}
        </p>
        <p className="mt-1 text-sm opacity-80">
          {room.draft.status === "paused"
            ? !turn?.userId
              ? `${turn?.name ?? "This seat"} still needs to open their invite link.`
              : `${turn?.name ?? "The current player"} will pick when the host resumes.`
            : yourTurn
              ? "Choose any open faction, slice, or position."
              : !turn?.userId
                ? "This seat still needs to open their invite link."
                : upcoming
                  ? `${upcoming.name} is up next.`
                  : "The table updates as soon as the pick is saved."}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <Button type="button" variant={panel === "draft" ? "primary" : "ghost"} onClick={() => setPanel("draft")}>
          Draft
        </Button>
        <Button type="button" variant={panel === "map" ? "primary" : "ghost"} onClick={() => setPanel("map")}>
          Galaxy map
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(240px,320px)]">
        <div className={`grid gap-4 ${panel === "map" ? "hidden lg:grid" : ""}`}>
          <section className="grid gap-3 rounded-3xl border border-white/10 bg-[#12182a]/90 p-4 sm:grid-cols-2 lg:grid-cols-1">
            <Stat label="Round" value={`${progress.round} of 4`} />
            <Stat label="Pick" value={`${progress.pick} of 24`} />
            <Stat label="Current" value={turn?.name ?? "—"} />
            <Stat label="Up next" value={upcoming?.name ?? "—"} />
          </section>
          <ChoicePanel
            room={room}
            engine={engine}
            pending={pending}
            busy={busy}
            onPending={choose}
            onConfirm={() => void confirm()}
            onViewSlice={viewSlice}
          />
        </div>

        <div className={panel === "draft" ? "hidden lg:block" : ""}>
          {preview ? (
            <section className="mb-4 rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg text-[#e4c27a]">{preview.name}</h2>
                <Button type="button" variant="ghost" className="min-h-10 px-3" onClick={() => setPreviewId(null)}>
                  Close preview
                </Button>
              </div>
              <p className="mt-1 text-sm text-white/60">This slice is not on the galaxy until its player drafts a position.</p>
              <SliceMap tileIds={previewTiles.slots} homes={awaitingHomes()} blankLabel={previewTiles.legacy ? "Older list" : "Empty"} />
              <SliceSummary
                tileIds={(previewTiles.legacy ?? previewTiles.slots).some(Boolean) ? (previewTiles.legacy ?? previewTiles.slots) : []}
                resources={preview.total_resources}
                influence={preview.total_influence}
                legacy={Boolean(previewTiles.legacy)}
              />
            </section>
          ) : null}
          <GalaxyMap seats={seats} highlightPosition={highlight} onHighlight={setHighlight} />
        </div>

        <div className={`grid gap-4 ${panel === "map" ? "hidden lg:grid" : ""}`}>
          <PlayerBoard room={room} activePlayerId={turn?.id ?? null} latestPickId={latest?.id ?? null} onSelect={viewPlayer} />
          <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
            <h2 className="font-display text-lg text-[#e4c27a]">Recent selections</h2>
            {recent.length === 0 ? <p className="mt-2 text-sm text-white/55">No selections yet.</p> : null}
            <ol className="mt-3 space-y-2">
              {recent.map((pick) => {
                const player = room.players.find((entry) => entry.id === pick.player_id);
                return (
                  <li key={pick.id} className={`rounded-xl bg-black/20 px-3 py-2 text-sm ${pick.id === latest?.id ? "pick-flash" : ""}`}>
                    Pick {pick.pick_number} · {player?.name ?? "Player"} · {describePick(pick, room.factions, room.slices)}
                  </li>
                );
              })}
            </ol>
          </section>
          <HostMenu room={room} refresh={refresh} report={report} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
