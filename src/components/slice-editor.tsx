"use client";

import { useState } from "react";
import { LegacyTileNote, SliceMap, SliceSummary, TileDetail } from "@/components/slice-view";
import { Button, TextInput } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { parseSliceImport } from "@/lib/slices";
import {
  buildSliceStats,
  duplicateTileIds,
  emptyTileSlots,
  hasTileIds,
  incompleteSliceMessage,
  lookupTile,
  padTileIds,
  parseTileLists,
  readStoredTiles,
  resolveSliceTile,
  SLICE_SLOTS,
  sliceNotes,
} from "@/lib/tiles";
import type { SliceDraft } from "@/lib/types";

export type SliceForm = {
  key: string;
  name: string;
  planets: string;
  resources: string;
  influence: string;
  notes: string;
  imageUrl: string;
  tileIds: string[];
  legacyTileIds: string[] | null;
};

export function committedTileIds(slice: SliceForm): readonly string[] {
  if (hasTileIds(slice.tileIds)) return slice.tileIds;
  return slice.legacyTileIds ?? slice.tileIds;
}

export function toSliceForm(slice: SliceDraft, key: string): SliceForm {
  return {
    key,
    name: slice.name,
    planets: slice.planets.join(", "),
    resources: String(slice.total_resources),
    influence: String(slice.total_influence),
    notes: slice.special_notes ?? "",
    imageUrl: slice.image_url ?? "",
    tileIds: readStoredTiles(slice.tile_ids ?? []).slots,
    legacyTileIds: readStoredTiles(slice.tile_ids ?? []).legacy,
  };
}

export function sliceFormToDraft(slice: SliceForm, allowDuplicates: boolean, requireComplete = false): SliceDraft {
  if (slice.imageUrl && !/^https?:\/\//i.test(slice.imageUrl)) {
    throw new Error(`${slice.name} needs an image URL starting with http:// or https://.`);
  }
  const tileIds = padTileIds(slice.tileIds);
  const editingTiles = hasTileIds(tileIds);
  if (slice.legacyTileIds && !editingTiles) {
    if (!/^[0-9]+$/.test(slice.resources) || !/^[0-9]+$/.test(slice.influence)) {
      throw new Error(`${slice.name || "A slice"} needs whole-number resources and influence.`);
    }
    return {
      name: slice.name.trim(),
      image_url: slice.imageUrl.trim() || null,
      planets: slice.planets.split(",").map((planet) => planet.trim()).filter(Boolean),
      total_resources: Number(slice.resources),
      total_influence: Number(slice.influence),
      special_notes: slice.notes.trim() || null,
      tile_ids: slice.legacyTileIds,
      allow_duplicate_tiles: allowDuplicates,
    };
  }
  if (editingTiles) {
    tileIds.forEach((id) => {
      if (id) resolveSliceTile(id);
    });
    const gap = incompleteSliceMessage(slice.name || "A slice", tileIds);
    if (gap && slice.legacyTileIds) {
      throw new Error(`${gap} The older tiles stay until all four new systems are filled: ${slice.legacyTileIds.filter(Boolean).join(", ")}.`);
    }
    if (gap && requireComplete) throw new Error(gap);
    const stats = buildSliceStats(tileIds.filter(Boolean));
    if (stats.resources > 120 || stats.influence > 120) {
      throw new Error(`${slice.name || "A slice"} has totals that are too large.`);
    }
    return {
      name: slice.name.trim(),
      image_url: slice.imageUrl.trim() || null,
      planets: stats.planets,
      total_resources: stats.resources,
      total_influence: stats.influence,
      special_notes: sliceNotes(stats),
      tile_ids: tileIds,
      allow_duplicate_tiles: allowDuplicates,
    };
  }
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
    tile_ids: [],
    allow_duplicate_tiles: allowDuplicates,
  };
}

export function SliceEditor({
  slices,
  allowDuplicates,
  onSlices,
  onAllowDuplicates,
}: {
  slices: SliceForm[];
  allowDuplicates: boolean;
  onSlices: (slices: SliceForm[]) => void;
  onAllowDuplicates: (value: boolean) => void;
}) {
  const [active, setActive] = useState<{ slice: number; slot: number } | null>(null);
  const [tileInput, setTileInput] = useState("");
  const [listText, setListText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [detail, setDetail] = useState<{ slice: number; id: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const duplicates = duplicateTileIds(slices.map((slice) => committedTileIds(slice)));
  const slot = active ? SLICE_SLOTS[active.slot] : null;

  function update(index: number, patch: Partial<SliceForm>) {
    onSlices(slices.map((slice, sliceIndex) => (sliceIndex === index ? { ...slice, ...patch } : slice)));
  }

  function chooseSlot(sliceIndex: number, slotIndex: number) {
    const current = slices[sliceIndex]?.tileIds[slotIndex] ?? "";
    setActive({ slice: sliceIndex, slot: slotIndex });
    setTileInput(current);
    setDetail(current ? { slice: sliceIndex, id: current } : null);
    setLocalError(null);
  }

  function applyTile() {
    if (!active) return;
    try {
      const id = tileInput.trim() ? resolveSliceTile(tileInput) : "";
      const next = padTileIds(slices[active.slice]?.tileIds ?? []);
      next[active.slot] = id;
      update(active.slice, { tileIds: next });
      setDetail(id ? { slice: active.slice, id } : null);
      setLocalError(null);
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#12182a]/90 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl text-[#e4c27a]">Slices</h2>
        <Button
          variant="ghost"
          disabled={slices.length >= 12}
          onClick={() =>
            onSlices([
              ...slices,
              toSliceForm(
                {
                  name: `Slice ${slices.length + 1}`,
                  planets: [],
                  total_resources: 0,
                  total_influence: 0,
                  special_notes: null,
                  image_url: null,
                  tile_ids: [],
                },
                crypto.randomUUID(),
              ),
            ])
          }
        >
          Add slice
        </Button>
      </div>
      <p className="mt-1 text-sm leading-6 text-white/55">
        Enter four system tiles. Order is top center, middle center, bottom left, then middle right. The red minor home and green main home stay reserved.
      </p>
      {duplicates.length ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-[#ffe3a3]">
          <input
            type="checkbox"
            className="mt-1"
            checked={allowDuplicates}
            onChange={(event) => onAllowDuplicates(event.target.checked)}
          />
          <span>Tile {duplicates.join(", ")} is in more than one slice. Allow it anyway.</span>
        </label>
      ) : null}
      {localError ? <p className="mt-3 text-sm text-[#ffd0d0]">{localError}</p> : null}

      <label className="mt-4 block text-sm text-white/70" htmlFor="tile-list">
        Tile numbers, one slice per line
      </label>
      <textarea
        id="tile-list"
        value={listText}
        onChange={(event) => setListText(event.target.value)}
        placeholder={"19,32,115,31\n26,29,30,37"}
        className="mt-2 min-h-24 w-full rounded-2xl border border-white/15 bg-[#070b14] p-3 font-mono text-sm outline-none focus:border-[#e4c27a]"
      />
      <Button
        variant="ghost"
        className="mt-2"
        onClick={() => {
          try {
            const lists = parseTileLists(listText);
            if (lists.length > 12) throw new Error("Import at most 12 slices.");
            const next = lists.map((ids, index) => {
              const existing = slices[index];
              return {
                ...(existing ??
                  toSliceForm(
                    {
                      name: `Slice ${index + 1}`,
                      planets: [],
                      total_resources: 0,
                      total_influence: 0,
                      special_notes: null,
                      image_url: null,
                    },
                    crypto.randomUUID(),
                  )),
                name: existing?.name || `Slice ${index + 1}`,
                tileIds: ids,
                legacyTileIds: null,
              };
            });
            const kept = slices.slice(lists.length);
            const combined = [...next, ...kept];
            if (combined.length < 6) throw new Error("Keep at least 6 slices. Add more lines or leave the existing slices.");
            onSlices(combined.slice(0, 12));
            setLocalError(null);
          } catch (error) {
            setLocalError(errorMessage(error));
          }
        }}
      >
        Fill slices from tile numbers
      </Button>

      <textarea
        value={jsonText}
        onChange={(event) => setJsonText(event.target.value)}
        placeholder='{"slices":[{"name":"Slice A","planets":["Wellon"],"resources":1,"influence":2}]}'
        className="mt-3 min-h-20 w-full rounded-2xl border border-white/15 bg-[#070b14] p-3 font-mono text-sm outline-none focus:border-[#e4c27a]"
      />
      <Button
        variant="ghost"
        className="mt-2"
        onClick={() => {
          try {
            const imported = parseSliceImport(JSON.parse(jsonText));
            if (imported.length < 6 || imported.length > 12) throw new Error("Import between 6 and 12 slices.");
            onSlices(imported.map((slice) => toSliceForm(slice, crypto.randomUUID())));
            setLocalError(null);
          } catch (error) {
            setLocalError(error instanceof SyntaxError ? "That slice JSON could not be parsed." : errorMessage(error));
          }
        }}
      >
        Import JSON
      </Button>

      <div className="mt-4 grid gap-4">
        {slices.map((slice, index) => (
          <div key={slice.key} className="rounded-2xl border border-white/10 p-3">
            <TextInput
              value={slice.name}
              aria-label={`Slice ${index + 1} name`}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <SliceMap
              tileIds={slice.tileIds}
              selectedIndex={active?.slice === index ? active.slot : null}
              onSelect={(slotIndex) => chooseSlot(index, slotIndex)}
              blankLabel={slice.legacyTileIds && !hasTileIds(slice.tileIds) ? "Older list" : "Empty"}
            />
            {slice.legacyTileIds ? (
              <LegacyTileNote tileIds={slice.legacyTileIds} onOpen={(tileId) => setDetail({ slice: index, id: tileId })} />
            ) : null}
            {slice.legacyTileIds && hasTileIds(slice.tileIds) ? (
              <Button variant="ghost" className="mt-2" onClick={() => update(index, { tileIds: emptyTileSlots() })}>
                Clear new tiles and keep the older five
              </Button>
            ) : null}
            <SliceSummary
              tileIds={slice.legacyTileIds && !hasTileIds(slice.tileIds) ? slice.legacyTileIds : slice.tileIds}
              resources={Number(slice.resources) || 0}
              influence={Number(slice.influence) || 0}
              legacy={Boolean(slice.legacyTileIds) && !hasTileIds(slice.tileIds)}
            />
            {active?.slice === index && slot ? (
              <div className="mt-3 grid gap-2">
                <label className="text-xs text-white/60" htmlFor={`tile-${slice.key}`}>
                  {slot.name}: {slot.detail}
                </label>
                <div className="flex gap-2">
                  <TextInput
                    id={`tile-${slice.key}`}
                    value={tileInput}
                    aria-label={`${slot.name} tile number`}
                    placeholder="Tile number"
                    onChange={(event) => setTileInput(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyTile();
                      }
                    }}
                  />
                  <Button type="button" variant="ghost" className="shrink-0 whitespace-nowrap" onClick={applyTile}>
                    Use tile
                  </Button>
                </div>
              </div>
            ) : null}
            {detail?.slice === index ? <TileDetail tileId={detail.id} tile={lookupTile(detail.id)} onClose={() => setDetail(null)} /> : null}
            {!hasTileIds(slice.tileIds) && !slice.legacyTileIds ? (
              <div className="mt-3 grid gap-2">
                <TextInput
                  value={slice.planets}
                  aria-label={`${slice.name} planets`}
                  placeholder="Planets, comma separated"
                  onChange={(event) => update(index, { planets: event.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <TextInput
                    inputMode="numeric"
                    value={slice.resources}
                    aria-label={`${slice.name} resources`}
                    onChange={(event) => update(index, { resources: event.target.value })}
                  />
                  <TextInput
                    inputMode="numeric"
                    value={slice.influence}
                    aria-label={`${slice.name} influence`}
                    onChange={(event) => update(index, { influence: event.target.value })}
                  />
                </div>
                <TextInput
                  value={slice.notes}
                  aria-label={`${slice.name} notes`}
                  placeholder="Notes"
                  onChange={(event) => update(index, { notes: event.target.value })}
                />
              </div>
            ) : null}
            <Button variant="ghost" className="mt-2" disabled={slices.length <= 6} onClick={() => onSlices(slices.filter((_, sliceIndex) => sliceIndex !== index))}>
              Remove slice
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function emptySliceForm(name: string): SliceForm {
  return {
    key: crypto.randomUUID(),
    name,
    planets: "",
    resources: "0",
    influence: "0",
    notes: "",
    imageUrl: "",
    tileIds: emptyTileSlots(),
    legacyTileIds: null,
  };
}
