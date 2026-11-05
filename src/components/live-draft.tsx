"use client";

import { useMemo, useState } from "react";
import { ChoicePanel } from "@/components/choice-panel";
import { HostMenu } from "@/components/host-menu";
import { PlayerBoard } from "@/components/player-board";
import { submitPick } from "@/lib/api";
import { describePick } from "@/lib/labels";
import { currentTurn, displayProgress, roomToEngine, upcomingTurn } from "@/lib/draft-rules";
import { errorMessage } from "@/lib/errors";
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
  const engine = useMemo(() => roomToEngine(room), [room]);
  const turn = currentTurn(engine);
  const upcoming = upcomingTurn(engine);
  const progress = displayProgress(engine);
  const yourTurn = room.draft.status === "active" && turn?.userId === room.userId;

  function choose(choice: PickChoice) {
    setPendingState({ key: turnKey, choice });
  }

  const recent = [...room.picks].sort((a, b) => b.pick_number - a.pick_number).slice(0, 6);

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
                : "The table updates as soon as the pick is saved."}
        </p>
      </section>

      <section className="grid gap-3 rounded-3xl border border-white/10 bg-[#12182a]/90 p-4 sm:grid-cols-4">
        <Stat label="Round" value={`${progress.round} of 4`} />
        <Stat label="Pick" value={`${progress.pick} of 24`} />
        <Stat label="Current" value={turn?.name ?? "—"} />
        <Stat label="Up next" value={upcoming?.name ?? "—"} />
      </section>

      <PlayerBoard room={room} activePlayerId={turn?.id ?? null} />
      <ChoicePanel room={room} engine={engine} pending={pending} busy={busy} onPending={choose} onConfirm={() => void confirm()} />

      <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
        <h2 className="font-display text-lg text-[#e4c27a]">Recent selections</h2>
        {recent.length === 0 ? <p className="mt-2 text-sm text-white/55">No selections yet.</p> : null}
        <ol className="mt-3 space-y-2">
          {recent.map((pick) => {
            const player = room.players.find((entry) => entry.id === pick.player_id);
            return (
              <li key={pick.id} className="rounded-xl bg-black/20 px-3 py-2 text-sm">
                Pick {pick.pick_number} · {player?.name ?? "Player"} · {describePick(pick, room.factions, room.slices)}
              </li>
            );
          })}
        </ol>
      </section>
      <HostMenu room={room} refresh={refresh} report={report} />
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
