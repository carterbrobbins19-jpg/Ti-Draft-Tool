"use client";

import { useState } from "react";
import { InviteList } from "@/components/host-menu";
import { Button, Notice, TextInput } from "@/components/ui";
import { FACTION_CATALOG, PLACEHOLDER_SLICES } from "@/lib/defaults";
import { startDraft, updateSetup } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatFactionLines, parseFactionLines, parseSliceImport } from "@/lib/slices";
import type { DraftRoom, SliceDraft } from "@/lib/types";

type SliceForm = {
  key: string;
  name: string;
  planets: string;
  resources: string;
  influence: string;
  notes: string;
  imageUrl: string;
};

function toForm(slice: SliceDraft, key: string): SliceForm {
  return {
    key,
    name: slice.name,
    planets: slice.planets.join(", "),
    resources: String(slice.total_resources),
    influence: String(slice.total_influence),
    notes: slice.special_notes ?? "",
    imageUrl: slice.image_url ?? "",
  };
}

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
        toForm(
          {
            name: slice.name,
            image_url: slice.image_url,
            planets: Array.isArray(slice.planets) ? slice.planets : [],
            total_resources: slice.total_resources,
            total_influence: slice.total_influence,
            special_notes: slice.special_notes,
          },
          slice.id,
        ),
      ),
  );
  const [jsonText, setJsonText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const me = room.players.find((player) => player.user_id === room.userId);

  function payload() {
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
    const sliceDrafts: SliceDraft[] = slices.map((slice) => {
      if (!/^[0-9]+$/.test(slice.resources) || !/^[0-9]+$/.test(slice.influence)) {
        throw new Error(`${slice.name || "A slice"} needs whole-number resources and influence.`);
      }
      if (slice.imageUrl && !/^https?:\/\//i.test(slice.imageUrl)) {
        throw new Error(`${slice.name} needs an image URL starting with http:// or https://.`);
      }
      return {
        name: slice.name.trim(),
        image_url: slice.imageUrl.trim() || null,
        planets: slice.planets.split(",").map((planet) => planet.trim()).filter(Boolean),
        total_resources: Number(slice.resources),
        total_influence: Number(slice.influence),
        special_notes: slice.notes.trim() || null,
      };
    });
    return {
      players: players.map((player) => ({ id: player.id, name: player.name.trim() })),
      factions,
      slices: sliceDrafts,
    };
  }

  async function save() {
    const next = payload();
    await updateSetup(room.draft.id, next.players, next.factions, next.slices);
    setDirty(false);
  }

  async function run(action: () => Promise<void>) {
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
        <h1 className="font-display text-3xl">Waiting room</h1>
        <p className="mt-2 text-sm text-white/70">
          {me ? `You are seated as ${me.name}.` : "You are in this draft."} The host will start when the table is ready.
        </p>
        <PlayerJoinList room={room} />
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-[#e4c27a]/30 bg-[#12182a]/90 p-4">
        <h1 className="font-display text-3xl">Lobby {room.draft.lobby_code}</h1>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Save the host recovery link. Open it on game day if this browser loses its session. Each player needs their own invite link.
        </p>
        {room.secrets ? <div className="mt-4"><InviteList invites={room.secrets.invites} hostToken={room.secrets.host_token} /></div> : null}
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
                  <span className="self-center px-1 text-xs text-white/45">{joined ? "Joined" : "Open"}</span>
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

      <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl text-[#e4c27a]">Slices</h2>
          <Button
            variant="ghost"
            onClick={() => {
              setSlices(PLACEHOLDER_SLICES.map((slice) => toForm(slice, crypto.randomUUID())));
              setDirty(true);
            }}
          >
            Load placeholders
          </Button>
        </div>
        <p className="mt-1 text-sm text-white/55">Enter slices yourself or paste JSON from another tool. This app does not generate maps.</p>
        <textarea
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          placeholder='{"slices":[{"name":"Slice A","planets":["Amber Gate"],"resources":4,"influence":3,"notes":"Legendary: Amber Gate"}]}'
          className="mt-3 min-h-28 w-full rounded-2xl border border-white/15 bg-[#070b14] p-3 font-mono text-sm outline-none focus:border-[#e4c27a]"
        />
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() => {
            try {
              const imported = parseSliceImport(JSON.parse(jsonText));
              if (imported.length < 6 || imported.length > 12) throw new Error("Import between 6 and 12 slices.");
              setSlices(imported.map((slice) => toForm(slice, crypto.randomUUID())));
              setDirty(true);
              setLocalError(null);
            } catch (error) {
              setLocalError(error instanceof SyntaxError ? "That slice JSON could not be parsed." : errorMessage(error));
            }
          }}
        >
          Import JSON
        </Button>
        <div className="mt-4 grid gap-3">
          {slices.map((slice, index) => (
            <div key={slice.key} className="grid gap-2 rounded-2xl border border-white/10 p-3">
              <TextInput
                value={slice.name}
                aria-label={`Slice ${index + 1} name`}
                onChange={(event) => updateSlice(index, { name: event.target.value })}
              />
              <TextInput
                value={slice.planets}
                aria-label={`${slice.name} planets`}
                placeholder="Planets, comma separated"
                onChange={(event) => updateSlice(index, { planets: event.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  inputMode="numeric"
                  value={slice.resources}
                  aria-label={`${slice.name} resources`}
                  onChange={(event) => updateSlice(index, { resources: event.target.value })}
                />
                <TextInput
                  inputMode="numeric"
                  value={slice.influence}
                  aria-label={`${slice.name} influence`}
                  onChange={(event) => updateSlice(index, { influence: event.target.value })}
                />
              </div>
              <TextInput
                value={slice.notes}
                aria-label={`${slice.name} notes`}
                placeholder="Legendary planets or other notes"
                onChange={(event) => updateSlice(index, { notes: event.target.value })}
              />
              <TextInput
                value={slice.imageUrl}
                aria-label={`${slice.name} image URL`}
                placeholder="Optional image URL"
                onChange={(event) => updateSlice(index, { imageUrl: event.target.value })}
              />
              <Button variant="ghost" disabled={slices.length <= 6} onClick={() => removeSlice(index)}>
                Remove slice
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          className="mt-3"
          disabled={slices.length >= 12}
          onClick={() => {
            setSlices((current) => [
              ...current,
              toForm(
                { name: `Slice ${current.length + 1}`, planets: [], total_resources: 0, total_influence: 0, special_notes: null, image_url: null },
                crypto.randomUUID(),
              ),
            ]);
            setDirty(true);
          }}
        >
          Add slice
        </Button>
      </section>

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
              if (dirty) await save();
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

  function updateSlice(index: number, patch: Partial<SliceForm>) {
    setSlices((current) => current.map((slice, sliceIndex) => (sliceIndex === index ? { ...slice, ...patch } : slice)));
    setDirty(true);
  }

  function removeSlice(index: number) {
    setSlices((current) => current.filter((_, sliceIndex) => sliceIndex !== index));
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
