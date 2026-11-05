"use client";

import { useState } from "react";
import { CopyLink, InviteList } from "@/components/host-menu";
import { committedTileIds, SliceEditor, sliceFormToDraft, toSliceForm, type SliceForm } from "@/components/slice-editor";
import { Button, Notice, TextInput } from "@/components/ui";
import { FACTION_CATALOG, PLACEHOLDER_SLICES } from "@/lib/defaults";
import { claimLobbySeat, setDraftTitle, setLobbyLocked, startDraft, updateSetup } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatFactionLines, parseFactionLines } from "@/lib/slices";
import { duplicateTileIds } from "@/lib/tiles";
import type { DraftRoom } from "@/lib/types";

export function LobbyPanel({
  room,
  refresh,
  report,
}: {
  room: DraftRoom;
  refresh: () => Promise<void>;
  report: (message: string | null) => void;
}) {
  const isHost = room.draft.host_user_id === room.userId;
  const [players, setPlayers] = useState(() => [...room.players].sort((a, b) => a.draft_order - b.draft_order));
  const [factionText, setFactionText] = useState(() =>
    formatFactionLines([...room.factions].sort((a, b) => a.sort_order - b.sort_order)),
  );
  const [slices, setSlices] = useState<SliceForm[]>(() =>
    [...room.slices]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((slice) =>
        toSliceForm(
          {
            name: slice.name,
            image_url: slice.image_url,
            planets: Array.isArray(slice.planets) ? slice.planets : [],
            total_resources: slice.total_resources,
            total_influence: slice.total_influence,
            special_notes: slice.special_notes,
            tile_ids: Array.isArray(slice.tile_ids) ? slice.tile_ids : [],
          },
          slice.id,
        ),
      ),
  );
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [title, setTitle] = useState(room.draft.title ?? "TI4 Draft");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const me = room.players.find((player) => player.user_id === room.userId);

  function payload(requireComplete = false) {
    const factions = parseFactionLines(factionText);
    if (factions.length < 12 || factions.length > 40) throw new Error("Choose between 12 and 40 factions.");
    for (const faction of factions) {
      if (faction.image_url && !/^https?:\/\//i.test(faction.image_url)) {
        throw new Error(`${faction.name} needs an image URL starting with http:// or https://.`);
      }
    }
    if (slices.length < 6 || slices.length > 12) throw new Error("Choose between 6 and 12 slices.");
    const names = players.map((player) => player.name.trim());
    if (names.some((name) => name.length < 1 || name.length > 40)) {
      throw new Error("Player names must be 1-40 characters.");
    }
    if (new Set(names.map((name) => name.toLowerCase())).size !== 6) throw new Error("Player names must be unique.");
    const duplicates = duplicateTileIds(slices.map((slice) => committedTileIds(slice)));
    if (duplicates.length && !allowDuplicates) {
      throw new Error(`Tile ${duplicates.join(", ")} is in more than one slice.`);
    }
    const sliceDrafts = slices.map((slice) => sliceFormToDraft(slice, allowDuplicates, requireComplete));
    return {
      players: players.map((player) => ({ id: player.id, name: player.name.trim() })),
      factions,
      slices: sliceDrafts,
    };
  }

  async function save(requireComplete = false) {
    const next = payload(requireComplete);
    await updateSetup(room.draft.id, next.players, next.factions, next.slices);
    setDirty(false);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setLocalError(null);
    report(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      const message = errorMessage(error);
      setLocalError(message);
      report(message);
    } finally {
      setBusy(false);
    }
  }

  if (!isHost) {
    return (
      <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
        <h1 className="font-display text-3xl">{room.draft.title ?? "Waiting room"}</h1>
        <p className="mt-2 font-mono text-xl tracking-[0.24em] text-[#e4c27a]">{room.draft.lobby_code}</p>
        <p className="mt-2 text-sm text-white/70">
          {me ? `You are seated as ${me.name}.` : "You are in this draft."} {room.players.filter((player) => player.user_id).length} of 6 seats claimed. The host will start when the table is ready.
        </p>
        <PlayerJoinList room={room} />
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-[#e4c27a]/30 bg-[#12182a]/90 p-4">
        <label className="text-xs uppercase tracking-[0.18em] text-white/45" htmlFor="room-name">
          Room name
        </label>
        <input
          id="room-name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const next = title.trim();
            if (!next || next === (room.draft.title ?? "TI4 Draft")) return;
            void run(() => setDraftTitle(room.draft.id, next));
          }}
          className="mt-1 w-full bg-transparent font-display text-3xl outline-none"
        />
        <p className="mt-2 font-mono text-2xl tracking-[0.28em] text-[#e4c27a]">{room.draft.lobby_code}</p>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Share one lobby link. Players claim a seat themselves. The room code does not give anyone host controls.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyLink label="Lobby link" path={`/join/${room.draft.lobby_code}`} />
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => setLobbyLocked(room.draft.id, room.draft.lobby_locked !== true))}>
            {room.draft.lobby_locked ? "Unlock seat claims" : "Lock seat claims"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-white/55">
          {room.players.filter((player) => player.user_id).length} of 6 seats claimed
          {room.draft.lobby_locked ? " · claims locked" : ""}
        </p>
        {room.secrets ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-white/60">Host recovery and personal seat links</summary>
            <div className="mt-3">
              <InviteList invites={room.secrets.invites} hostToken={room.secrets.host_token} />
            </div>
          </details>
        ) : null}
      </section>

      {localError ? <Notice>{localError}</Notice> : null}
      {dirty ? <Notice tone="info">You have unsaved lobby changes.</Notice> : null}

      <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl text-[#e4c27a]">Players</h2>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const copy = [...players];
              for (let index = copy.length - 1; index > 0; index -= 1) {
                const swap = Math.floor(Math.random() * (index + 1));
                [copy[index], copy[swap]] = [copy[swap], copy[index]];
              }
              setPlayers(copy);
              setDirty(true);
            }}
          >
            Randomize order
          </Button>
        </div>
        <p className="mt-1 text-sm text-white/55">Order 1 picks first. The snake reverses each round.</p>
        <div className="mt-3 grid gap-2">
          {players.map((player, index) => {
            const joined = room.players.find((entry) => entry.id === player.id)?.user_id;
            return (
              <div key={player.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                <span className="w-6 text-sm text-[#e4c27a]">{index + 1}</span>
                <TextInput
                  value={player.name}
                  aria-label={`Player ${index + 1} name`}
                  onChange={(event) => {
                    const next = [...players];
                    next[index] = { ...player, name: event.target.value };
                    setPlayers(next);
                    setDirty(true);
                  }}
                />
                <div className="flex gap-1">
                  <Button variant="ghost" className="min-h-12 px-3" disabled={index === 0} onClick={() => move(index, -1)}>
                    Up
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-12 px-3"
                    disabled={index === players.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Down
                  </Button>
                  {joined ? (
                    <span className="self-center px-1 text-xs text-white/45">Claimed</span>
                  ) : !me && !room.draft.lobby_locked ? (
                    <Button
                      variant="ghost"
                      className="min-h-12 px-3"
                      disabled={busy}
                      onClick={() => void run(() => claimLobbySeat(room.draft.lobby_code, player.id).then(() => undefined))}
                    >
                      Claim
                    </Button>
                  ) : (
                    <span className="self-center px-1 text-xs text-white/45">{room.draft.lobby_locked ? "Locked" : "Open"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl text-[#e4c27a]">Factions</h2>
          <Button
            variant="ghost"
            onClick={() => {
              setFactionText(formatFactionLines(FACTION_CATALOG));
              setDirty(true);
            }}
          >
            Load full catalog
          </Button>
        </div>
        <p className="mt-1 text-sm text-white/55">One faction per line: Name | Expansion | Image URL. At least 12.</p>
        <textarea
          value={factionText}
          onChange={(event) => {
            setFactionText(event.target.value);
            setDirty(true);
          }}
          className="mt-3 min-h-64 w-full rounded-2xl border border-white/15 bg-[#070b14] p-3 font-mono text-sm outline-none focus:border-[#e4c27a]"
        />
      </section>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={() => {
            setSlices(PLACEHOLDER_SLICES.map((slice) => toSliceForm(slice, crypto.randomUUID())));
            setDirty(true);
          }}
        >
          Load placeholder slices
        </Button>
      </div>
      <SliceEditor
        slices={slices}
        allowDuplicates={allowDuplicates}
        onSlices={(next) => {
          setSlices(next);
          setDirty(true);
        }}
        onAllowDuplicates={(value) => {
          setAllowDuplicates(value);
          setDirty(true);
        }}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="ghost" disabled={busy || !dirty} onClick={() => void run(save)}>
          {busy ? "Saving..." : "Save lobby"}
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const unclaimed = room.players.filter((player) => !player.user_id).length;
              if (unclaimed > 0 && !window.confirm(`${unclaimed} seat(s) have not joined. Start anyway?`)) return;
              if (dirty) await save(true);
              else payload(true);
              await startDraft(room.draft.id);
            })
          }
        >
          Start draft
        </Button>
      </div>
    </div>
  );

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    const copy = [...players];
    const [item] = copy.splice(index, 1);
    if (!item) return;
    copy.splice(nextIndex, 0, item);
    setPlayers(copy);
    setDirty(true);
  }

}

function PlayerJoinList({ room }: { room: DraftRoom }) {
  const players = [...room.players].sort((a, b) => a.draft_order - b.draft_order);
  return (
    <ul className="mt-4 space-y-2">
      {players.map((player, index) => (
        <li key={player.id} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-3">
          <span>
            {index + 1}. {player.name}
          </span>
          <span className="text-xs text-white/50">{player.user_id ? "Joined" : "Waiting"}</span>
        </li>
      ))}
    </ul>
  );
}
