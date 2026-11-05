"use client";

import { useState } from "react";
import { HexTable } from "@/components/hex-table";
import { LegacyTileNote, SliceMap, SliceSummary, TileDetail } from "@/components/slice-view";
import { Button } from "@/components/ui";
import { awaitingHomes } from "@/lib/slice-homes";
import { lookupTile, readStoredTiles } from "@/lib/tiles";
import { seatDraft } from "@/lib/board";
import { selectionBlocker, type EngineState } from "@/lib/draft-rules";
import { accentFor, choiceLabel } from "@/lib/labels";
import type { DraftRoom, PickChoice } from "@/lib/types";

const tabs = [
  { id: "factions", label: "Factions" },
  { id: "slices", label: "Slices" },
  { id: "positions", label: "Positions" },
] as const;

export function ChoicePanel({
  room,
  engine,
  pending,
  busy,
  onPending,
  onConfirm,
}: {
  room: DraftRoom;
  engine: EngineState;
  pending: PickChoice | null;
  busy: boolean;
  onPending: (choice: PickChoice) => void;
  onConfirm: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("factions");
  const [openTile, setOpenTile] = useState<{ sliceId: string; tileId: string; heading?: string; emptyNote?: string } | null>(null);
  const me = room.players.find((player) => player.user_id === room.userId);
  const mine = me ? seatDraft(room.picks, me.id) : null;
  const label = pending ? choiceLabel(pending, room.factions, room.slices) : "";
  const legal = pending ? selectionBlocker(engine, room.userId, pending) === null : false;

  return (
    <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-3 sm:p-4">
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Draft choices">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`min-h-12 rounded-xl text-sm font-semibold ${
              tab === item.id ? "bg-[#e4c27a] text-[#1a1204]" : "bg-white/5 text-white/75"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4" role="tabpanel">
        {tab === "factions" ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[...room.factions]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((faction) => {
                const owner = room.picks.find((pick) => pick.faction_id === faction.id);
                const ownerName = room.players.find((player) => player.id === owner?.player_id)?.name;
                const choice: PickChoice = { category: "faction", factionId: faction.id };
                const blocked = selectionBlocker(engine, room.userId, choice);
                const selected = pending?.category === "faction" && pending.factionId === faction.id;
                return (
                  <button
                    key={faction.id}
                    type="button"
                    disabled={Boolean(blocked)}
                    onClick={() => onPending(choice)}
                    className={`min-h-24 rounded-2xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected ? "border-[#e4c27a] bg-[#e4c27a]/15" : "border-white/10 bg-[#0c1222]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {faction.image_url ? (
                        // Faction art is an optional host-supplied URL.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={faction.image_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <span
                          className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-[#1a1204]"
                          style={{ background: accentFor(faction.name) }}
                        >
                          {faction.name.slice(0, 1)}
                        </span>
                      )}
                      <span>
                        <span className="block font-semibold leading-5">{faction.name}</span>
                        <span className="block text-xs text-white/45">{faction.expansion ?? "Custom"}</span>
                      </span>
                    </span>
                    {ownerName ? <span className="mt-3 block text-xs text-white/50">Drafted by {ownerName}</span> : null}
                    {!ownerName && mine && mine.factions.length >= 2 ? (
                      <span className="mt-3 block text-xs text-white/50">Faction limit reached</span>
                    ) : null}
                  </button>
                );
              })}
          </div>
        ) : null}

        {tab === "slices" ? (
          <div className="grid gap-3">
            {[...room.slices]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((slice) => {
                const owner = room.picks.find((pick) => pick.slice_id === slice.id);
                const ownerName = room.players.find((player) => player.id === owner?.player_id)?.name;
                const choice: PickChoice = { category: "slice", sliceId: slice.id };
                const blocked = selectionBlocker(engine, room.userId, choice);
                const selected = pending?.category === "slice" && pending.sliceId === slice.id;
                const stored = readStoredTiles(Array.isArray(slice.tile_ids) ? slice.tile_ids : []);
                const summaryIds = stored.legacy ?? stored.slots;
                const planets = Array.isArray(slice.planets) ? slice.planets : [];
                return (
                  <article
                    key={slice.id}
                    className={`rounded-2xl border p-3 ${selected ? "border-[#e4c27a] bg-[#e4c27a]/15" : "border-white/10 bg-[#0c1222]"}`}
                  >
                    <h3 className="font-semibold">{slice.name}</h3>
                    <SliceMap
                      tileIds={stored.slots}
                      homes={awaitingHomes()}
                      blankLabel={stored.legacy ? "Older list" : "Empty"}
                      onInspect={(detail) =>
                        setOpenTile({
                          sliceId: slice.id,
                          tileId: detail.tileId,
                          heading: detail.factionName ?? (detail.role === "main" ? "Home system" : detail.role === "minor" ? "Minor home" : undefined),
                          emptyNote:
                            detail.role === "system"
                              ? undefined
                              : detail.factionName
                                ? "This faction's home system is not in the local catalog. Only the name is shown."
                                : "This home is reserved until the host reveals main and minor factions.",
                        })
                      }
                    />
                    {stored.legacy ? <LegacyTileNote tileIds={stored.legacy} onOpen={(tileId) => setOpenTile({ sliceId: slice.id, tileId })} /> : null}
                    {!stored.legacy && !stored.slots.some(Boolean) ? (
                      <p className="mt-1 text-sm text-white/70">{planets.join(", ") || "No planets listed"}</p>
                    ) : null}
                    <SliceSummary
                      tileIds={summaryIds.some(Boolean) ? summaryIds : []}
                      resources={slice.total_resources}
                      influence={slice.total_influence}
                      legacy={Boolean(stored.legacy)}
                    />
                    {slice.special_notes && !summaryIds.some(Boolean) ? <p className="mt-1 text-xs text-white/55">{slice.special_notes}</p> : null}
                    {openTile?.sliceId === slice.id ? (
                      <TileDetail
                        tileId={openTile.tileId}
                        tile={openTile.tileId ? lookupTile(openTile.tileId) : null}
                        heading={openTile.heading}
                        emptyNote={openTile.emptyNote}
                        onClose={() => setOpenTile(null)}
                      />
                    ) : null}
                    {ownerName ? <p className="mt-2 text-xs text-white/50">Drafted by {ownerName}</p> : null}
                    <Button className="mt-3 w-full" variant={selected ? "primary" : "ghost"} disabled={Boolean(blocked)} onClick={() => onPending(choice)}>
                      {selected ? "Selected" : "Select slice"}
                    </Button>
                  </article>
                );
              })}
          </div>
        ) : null}

        {tab === "positions" ? (
          <div className="space-y-4">
            <HexTable
              seats={[1, 2, 3, 4, 5, 6].map((position) => {
                const owner = room.picks.find((pick) => pick.position_number === position);
                const ownerName = room.players.find((player) => player.id === owner?.player_id)?.name;
                const choice: PickChoice = { category: "position", position };
                const blocked = selectionBlocker(engine, room.userId, choice);
                return {
                  position,
                  title: ownerName ?? "Open",
                  subtitle: ownerName ? "Drafted" : "Available",
                  taken: Boolean(owner),
                  selected: pending?.category === "position" && pending.position === position,
                  disabled: Boolean(blocked),
                  onSelect: () => onPending(choice),
                };
              })}
            />
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6].map((position) => {
                const owner = room.picks.find((pick) => pick.position_number === position);
                const ownerName = room.players.find((player) => player.id === owner?.player_id)?.name;
                const choice: PickChoice = { category: "position", position };
                const selected = pending?.category === "position" && pending.position === position;
                return (
                  <button
                    key={position}
                    type="button"
                    disabled={Boolean(selectionBlocker(engine, room.userId, choice))}
                    onClick={() => onPending(choice)}
                    className={`min-h-14 rounded-xl border text-sm font-semibold disabled:opacity-45 ${
                      selected ? "border-[#e4c27a] bg-[#e4c27a] text-[#1a1204]" : "border-white/10 bg-[#0c1222]"
                    }`}
                  >
                    {position}
                    <span className="block text-[10px] font-normal opacity-70">{ownerName ?? "Open"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {legal ? (
        <div className="sticky bottom-3 mt-4">
          <Button className="w-full text-base" disabled={busy} onClick={onConfirm}>
            {busy ? "Sending pick..." : `Draft ${label}`}
          </Button>
        </div>
      ) : null}
      {pending && !legal ? <p className="mt-3 text-sm text-white/55">That selection is no longer available.</p> : null}
    </section>
  );
}
