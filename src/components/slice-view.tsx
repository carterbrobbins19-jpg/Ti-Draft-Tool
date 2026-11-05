"use client";

import { useId } from "react";
import type { SliceHomes } from "@/lib/slice-homes";
import { reservedHomes } from "@/lib/slice-homes";
import {
  SLICE_LAYOUT,
  buildSliceStats,
  formatStat,
  labelAnomaly,
  labelSpecialty,
  labelWormhole,
  legacySlotName,
  lookupTile,
  specialTileWarning,
  type SystemTile,
  type TilePlanet,
} from "@/lib/tiles";

const SIZE = 64;
const HEX_W = Math.sqrt(3) * SIZE;
const HEX_H = SIZE * 2;
const STEP_Y = HEX_H * 0.75;
const PAD = 8;
const VIEW_W = HEX_W * 3.5 + PAD * 2;
const VIEW_H = STEP_Y * 2 + HEX_H + PAD * 2;

const HEX_POINTS = Array.from({ length: 6 }, (_, index) => {
  const angle = (Math.PI / 180) * (60 * index - 90);
  return `${(SIZE * Math.cos(angle)).toFixed(2)},${(SIZE * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

const WORMHOLE_GLYPH: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
};

function cellCenter(col: number, row: number) {
  return {
    x: PAD + col * HEX_W + (row % 2) * (HEX_W / 2) + HEX_W / 2,
    y: PAD + row * STEP_Y + HEX_H / 2,
  };
}

function traitFill(trait: TilePlanet["trait"]): string {
  if (trait === "hazardous") return "#e07a6c";
  if (trait === "industrial") return "#7dcea0";
  if (trait === "cultural") return "#6cb6ff";
  return "#d9d3c5";
}

function specialtyMark(specialty: string | null): string {
  if (specialty === "biotic") return "B";
  if (specialty === "warfare") return "W";
  if (specialty === "propulsion") return "P";
  if (specialty === "cybernetic") return "C";
  if (specialty === "space-station") return "SS";
  return "";
}

function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function wrapName(value: string): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 14 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3).map((line) => shorten(line, 16));
}

function toneFor(tile: SystemTile | null, role: "system" | "main" | "minor") {
  if (role === "minor") return { fill: "#4a1d2a", stroke: "#e07a90", ink: "#ffd7df" };
  if (role === "main") return { fill: "#143528", stroke: "#7dcea0", ink: "#d9ffe8" };
  if (tile?.type === "red") return { fill: "#4a1d2a", stroke: "#e07a90", ink: "#ffd7df" };
  if (tile?.type === "green") return { fill: "#143528", stroke: "#7dcea0", ink: "#d9ffe8" };
  if (tile?.type === "hyperlane") return { fill: "#2a2150", stroke: "#b7a6ff", ink: "#efeaff" };
  if (tile) return { fill: "#16324f", stroke: "#7eb6e0", ink: "#f4f7ff" };
  return { fill: "#10182b", stroke: "#8d7a45", ink: "#e8eefc" };
}

function AnomalyArt({ anomalies }: { anomalies: readonly string[] }) {
  if (anomalies.includes("asteroid-field")) {
    return (
      <g opacity="0.8">
        <circle cx="-18" cy="-6" r="4" fill="#6b6258" />
        <circle cx="6" cy="-16" r="3" fill="#8a8174" />
        <circle cx="16" cy="2" r="5" fill="#514a42" />
        <circle cx="-8" cy="12" r="3.5" fill="#7a7268" />
      </g>
    );
  }
  if (anomalies.includes("nebula")) {
    return (
      <g opacity="0.55">
        <ellipse cx="-8" cy="0" rx="24" ry="14" fill="#7a5cff" />
        <ellipse cx="12" cy="6" rx="16" ry="10" fill="#c084fc" />
      </g>
    );
  }
  if (anomalies.includes("supernova") || anomalies.includes("muaat-supernova")) {
    return (
      <g stroke="#ffb45a" strokeWidth="1.4" opacity="0.85">
        <line x1="0" y1="-22" x2="0" y2="22" />
        <line x1="-20" y1="-10" x2="20" y2="10" />
        <line x1="-20" y1="10" x2="20" y2="-10" />
        <circle cx="0" cy="0" r="6" fill="#ffb45a" stroke="none" />
      </g>
    );
  }
  if (anomalies.includes("gravity-rift")) {
    return <path d="M-22 16 C-8 4, 2 -8, 20-20" fill="none" stroke="#9ad7ff" strokeWidth="3" opacity="0.8" />;
  }
  if (anomalies.includes("entropic-scar")) {
    return <path d="M-24 -8 L22 14" fill="none" stroke="#d6b4ff" strokeWidth="3" opacity="0.8" />;
  }
  return null;
}

function PlanetLines({ planets, ink }: { planets: readonly TilePlanet[]; ink: string }) {
  const shown = planets.slice(0, 2);
  return (
    <g className="slice-rich">
      {shown.map((planet, index) => {
        const y = planets.length === 1 ? 6 : index === 0 ? -8 : 16;
        const mark = specialtyMark(planet.specialty);
        return (
          <g key={planet.name}>
            <circle cx={-38} cy={y - 3} r="4.5" fill={traitFill(planet.trait)} stroke={planet.legendary ? "#e4c27a" : "none"} strokeWidth="1.5" />
            <text x={-30} y={y} fill={ink} fontSize="10">
              {shorten(planet.name, 11)} {planet.resources}/{planet.influence}
              {mark ? ` ${mark}` : ""}
            </text>
          </g>
        );
      })}
      {planets.length > 2 ? (
        <text y="34" textAnchor="middle" fill="#e4c27a" fontSize="9">
          +{planets.length - 2} more
        </text>
      ) : null}
    </g>
  );
}

function SystemBody({ tile, tileId, unknown }: { tile: SystemTile | null; tileId: string; unknown: boolean }) {
  const label = tile?.anomalies[0] ? labelAnomaly(tile.anomalies[0]) : tile?.wormholes[0] ? `${labelWormhole(tile.wormholes[0])} wormhole` : tile?.kind === "hyperlane" ? "Hyperlane" : unknown ? "Unknown" : "Empty";
  return (
    <>
      <g className="slice-rich">
        <text y={tile?.planets.length ? -38 : -16} textAnchor="middle" fill="#e4c27a" fontSize="14" fontWeight="700">
          {tileId || "—"}
        </text>
        {tile && tile.planets.length ? <PlanetLines planets={tile.planets} ink="#f4f7ff" /> : null}
        {tile && !tile.planets.length ? (
          <text y="8" textAnchor="middle" fill="#f4f7ff" fontSize="11">
            {shorten(label, 16)}
          </text>
        ) : null}
        {!tile ? (
          <text y="8" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11">
            {label}
          </text>
        ) : null}
        {tile && tile.wormholes.length ? (
          <text y="40" textAnchor="middle" fill="#9ad7ff" fontSize="11">
            {tile.wormholes.map((wormhole) => WORMHOLE_GLYPH[wormhole] ?? labelWormhole(wormhole).slice(0, 1)).join(" ")}
          </text>
        ) : null}
        {tile && tile.planets.some((planet) => planet.legendary) ? (
          <text x="30" y="-36" textAnchor="middle" fill="#e4c27a" fontSize="12">
            ★
          </text>
        ) : null}
      </g>
      <g className="slice-short">
        <text y="-6" textAnchor="middle" fill="#e4c27a" fontSize="18" fontWeight="700">
          {tileId || "—"}
        </text>
        <text y="16" textAnchor="middle" fill="#f4f7ff" fontSize="10">
          {tile?.planets[0] ? `${shorten(tile.planets[0].name, 12)} ${tile.planets[0].resources}/${tile.planets[0].influence}` : shorten(label, 16)}
        </text>
      </g>
    </>
  );
}

function HomeBody({ title, subtitle, tile }: { title: string; subtitle: string; tile: SystemTile | null }) {
  const lines = wrapName(title);
  const start = lines.length > 2 ? -20 : -8;
  return (
    <>
      <g className="slice-rich">
        {lines.map((line, index) => (
          <text key={line} y={start + index * 14} textAnchor="middle" fill="#f4f7ff" fontSize="11" fontWeight="700">
            {line}
          </text>
        ))}
        {subtitle ? (
          <text y={start + lines.length * 14 + 4} textAnchor="middle" fill="#e4c27a" fontSize="9">
            {subtitle}
          </text>
        ) : null}
        {tile?.planets[0] ? (
          <text y="40" textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="9">
            {shorten(tile.planets[0].name, 14)}
          </text>
        ) : null}
      </g>
      <g className="slice-short">
        <text y="-4" textAnchor="middle" fill="#f4f7ff" fontSize="10" fontWeight="700">
          {shorten(title, 14)}
        </text>
        {subtitle ? (
          <text y="14" textAnchor="middle" fill="#e4c27a" fontSize="8">
            {subtitle}
          </text>
        ) : null}
      </g>
    </>
  );
}

export function SliceMap({
  tileIds,
  selectedIndex = null,
  onSelect,
  onInspect,
  homes,
  blankLabel = "Empty",
}: {
  tileIds: readonly string[];
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
  onInspect?: (detail: { role: "system" | "main" | "minor"; tileId: string; factionName: string | null }) => void;
  homes?: SliceHomes;
  blankLabel?: string;
}) {
  const clipBase = useId().replace(/:/g, "");
  const shownHomes = homes ?? reservedHomes();
  return (
    <div className="mx-auto w-full max-w-[460px]">
      <svg viewBox={`0 0 ${VIEW_W.toFixed(2)} ${VIEW_H.toFixed(2)}`} className="h-auto w-full font-sans" role="group" aria-label="Six hex slice">
        <defs>
          {SLICE_LAYOUT.map((cell) => (
            <clipPath id={`${clipBase}-${cell.id}`} key={cell.id}>
              <polygon points={HEX_POINTS} />
            </clipPath>
          ))}
        </defs>
        {SLICE_LAYOUT.map((cell) => {
          const center = cellCenter(cell.col, cell.row);
          const systemId = cell.slot === null ? "" : (tileIds[cell.slot] ?? "");
          const tile = systemId ? lookupTile(systemId) : cell.role === "main" ? (shownHomes.main.tileId ? lookupTile(shownHomes.main.tileId) : null) : cell.role === "minor" ? (shownHomes.minor.tileId ? lookupTile(shownHomes.minor.tileId) : null) : null;
          const tone = toneFor(cell.role === "system" ? tile : tile, cell.role);
          const home = cell.role === "main" ? shownHomes.main : cell.role === "minor" ? shownHomes.minor : null;
          const clickable = cell.editable ? Boolean(onSelect || (onInspect && systemId)) : Boolean(onInspect && home);
          const label = cell.editable ? (systemId ? `Tile ${systemId}, ${cell.name}` : `${cell.name}, empty system`) : `${home?.title ?? cell.name} ${home?.subtitle ?? ""}`.trim();
          return (
            <g
              key={cell.id}
              transform={`translate(${center.x.toFixed(2)} ${center.y.toFixed(2)})`}
              role={clickable ? "button" : "img"}
              tabIndex={clickable ? 0 : undefined}
              aria-label={label}
              className={clickable ? "cursor-pointer outline-none" : undefined}
              onClick={() => {
                if (cell.editable && cell.slot !== null && onSelect) onSelect(cell.slot);
                else if (cell.editable && systemId && onInspect) onInspect({ role: "system", tileId: systemId, factionName: null });
                else if (home && onInspect) onInspect({ role: cell.role === "main" ? "main" : "minor", tileId: home.tileId ?? "", factionName: home.factionName });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                (event.currentTarget as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
              }}
            >
              <g clipPath={`url(#${clipBase}-${cell.id})`}>
                <polygon points={HEX_POINTS} fill={tone.fill} />
                {cell.role === "system" && tile ? <AnomalyArt anomalies={tile.anomalies} /> : null}
                {!tile && cell.editable ? (
                  <>
                    <circle cx="-16" cy="-12" r="1.2" fill="rgba(255,255,255,0.35)" />
                    <circle cx="18" cy="-4" r="1" fill="rgba(255,255,255,0.28)" />
                    <circle cx="4" cy="16" r="1.3" fill="rgba(255,255,255,0.22)" />
                  </>
                ) : null}
              </g>
              <polygon
                points={HEX_POINTS}
                fill="none"
                stroke={selectedIndex !== null && cell.slot === selectedIndex ? "#e4c27a" : tone.stroke}
                strokeWidth={selectedIndex !== null && cell.slot === selectedIndex ? 4 : 2}
                strokeDasharray={!tile && cell.editable ? "5 4" : undefined}
              />
              {cell.editable ? (
                systemId || tile ? (
                  <SystemBody tile={tile} tileId={systemId} unknown={Boolean(systemId) && !tile} />
                ) : (
                  <text y="4" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
                    {blankLabel}
                  </text>
                )
              ) : home ? (
                <HomeBody title={home.title} subtitle={home.subtitle} tile={tile} />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LegacyTileNote({
  tileIds,
  onOpen,
}: {
  tileIds: readonly string[];
  onOpen?: (tileId: string) => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-[#e4c27a]/30 bg-black/20 p-3 text-sm">
      <p className="text-[#ffe3a3]">This slice still has five system tiles from the previous layout. None of them were removed.</p>
      <ul className="mt-2 space-y-1">
        {tileIds.map((tileId, index) => {
          const tile = tileId ? lookupTile(tileId) : null;
          const planet = tile?.planets.map((item) => item.name).join(", ");
          return (
            <li key={`${tileId}-${index}`}>
              <button type="button" className="text-left text-white/80" onClick={() => tileId && onOpen?.(tileId)}>
                <span className="text-[#e4c27a]">{legacySlotName(index)}:</span> {tileId || "—"}
                {planet ? ` · ${planet}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SliceSummary({
  tileIds,
  resources,
  influence,
  legacy = false,
}: {
  tileIds: readonly string[];
  resources?: number;
  influence?: number;
  legacy?: boolean;
}) {
  const filled = tileIds.some((id) => id.trim());
  const stats = filled ? buildSliceStats(tileIds) : null;
  const shownResources = stats ? stats.resources : (resources ?? 0);
  const shownInfluence = stats ? stats.influence : (influence ?? 0);
  return (
    <div className="mt-2 space-y-1 text-xs leading-5 text-white/70">
      <p className="text-[#e4c27a]">
        {shownResources} resources · {shownInfluence} influence
        {stats ? ` · ${stats.planetCount} planets · ${stats.specialtyCount} tech` : ""}
      </p>
      {stats ? (
        <p>
          Optimal {formatStat(stats.optimalResources)} resources / {formatStat(stats.optimalInfluence)} influence
        </p>
      ) : null}
      {stats && stats.wormholes.length ? <p>Wormholes: {stats.wormholes.map(labelWormhole).join(", ")}</p> : null}
      {stats && stats.anomalies.length ? <p>Anomalies: {stats.anomalies.map(labelAnomaly).join(", ")}</p> : null}
      {stats && stats.legendary.length ? <p>Legendary: {stats.legendary.join(", ")}</p> : null}
      {stats && stats.specialties.length ? <p>Tech: {stats.specialties.map(labelSpecialty).join(", ")}</p> : null}
      {stats && stats.unknown.length ? <p className="text-[#ffd0d0]">Unknown tile: {stats.unknown.join(", ")}</p> : null}
      {stats ? <p>{legacy ? "Totals use the earlier five system tiles. Home systems are not included." : "Totals use the four system tiles. Home systems are not included."}</p> : null}
    </div>
  );
}

export function TileDetail({
  tile,
  tileId,
  onClose,
  heading,
  emptyNote,
}: {
  tile: SystemTile | null;
  tileId: string;
  onClose: () => void;
  heading?: string;
  emptyNote?: string;
}) {
  const warning = tile ? specialTileWarning(tile) : null;
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#e4c27a]">{heading ?? `Tile ${tileId || "empty"}`}</p>
          <p className="text-xs text-white/50">{tile ? `${tile.expansion} · ${tile.kind}` : tileId ? "Not in the local catalog" : "Reserved home"}</p>
        </div>
        <button type="button" className="text-xs text-white/60" onClick={onClose}>
          Close
        </button>
      </div>
      {warning ? <p className="mt-2 text-xs leading-5 text-[#ffe3a3]">{warning}</p> : null}
      {tile?.faction ? <p className="mt-2 text-white/80">{tile.faction}</p> : null}
      {tile?.planets.length ? (
        <ul className="mt-2 space-y-1">
          {tile.planets.map((planet) => (
            <li key={planet.name}>
              {planet.name}: {planet.resources} resources / {planet.influence} influence
              {planet.trait ? ` · ${planet.trait}` : ""}
              {planet.specialty ? ` · ${labelSpecialty(planet.specialty)}` : ""}
              {planet.legendary ? " · legendary" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-white/60">{emptyNote ?? (tile ? "No planets." : "This number is not in the Base, Prophecy of Kings, or Thunder's Edge catalog.")}</p>
      )}
      {tile && tile.wormholes.length ? <p className="mt-2">Wormholes: {tile.wormholes.map(labelWormhole).join(", ")}</p> : null}
      {tile && tile.anomalies.length ? <p>Anomalies: {tile.anomalies.map(labelAnomaly).join(", ")}</p> : null}
      {tile && tile.links.length ? <p>Hyperlane links: {tile.links.map((link) => link.join("–")).join(", ")}</p> : null}
    </div>
  );
}
