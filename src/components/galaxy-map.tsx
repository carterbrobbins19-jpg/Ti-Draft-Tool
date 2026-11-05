"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { TileDetail } from "@/components/slice-view";
import { Button } from "@/components/ui";
import {
  HEX_SIZE,
  POSITION_LABELS,
  hexPixel,
  placeGalaxy,
  type PlacedHex,
  type SeatPlacement,
} from "@/lib/galaxy";
import { buildSliceStats, formatStat, labelAnomaly, labelWormhole, lookupTile, type SystemTile } from "@/lib/tiles";

const HEX_POINTS = Array.from({ length: 6 }, (_, index) => {
  const angle = (Math.PI / 180) * (60 * index - 90);
  return `${(HEX_SIZE * Math.cos(angle)).toFixed(2)},${(HEX_SIZE * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

const WORMHOLE_GLYPH: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
};

function bounds() {
  const points = placeGalaxy([]).map((hex) => hexPixel(hex.q, hex.r));
  const minX = Math.min(...points.map((point) => point.x)) - HEX_SIZE - 28;
  const maxX = Math.max(...points.map((point) => point.x)) + HEX_SIZE + 28;
  const minY = Math.min(...points.map((point) => point.y)) - HEX_SIZE - 18;
  const maxY = Math.max(...points.map((point) => point.y)) + HEX_SIZE + 36;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

const FRAME = bounds();

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function face(hex: PlacedHex, tile: SystemTile | null) {
  if (hex.role === "mecatol") return { fill: "#3a2e12", stroke: "#e4c27a", ink: "#f6edd8" };
  if (hex.role === "main") return { fill: "#143528", stroke: hex.color ?? "#7dcea0", ink: "#d9ffe8" };
  if (hex.role === "minor") return { fill: "#3d2148", stroke: hex.color ?? "#e08bb8", ink: "#ffd7ef" };
  if (tile?.type === "red") return { fill: "#4a1d2a", stroke: hex.color ?? "#e07a90", ink: "#ffd7df" };
  if (tile) return { fill: "#16324f", stroke: hex.color ?? "#7eb6e0", ink: "#f4f7ff" };
  return { fill: "#10182b", stroke: hex.color ?? "#6d6244", ink: "#e8eefc" };
}

export function GalaxyMap({
  seats,
  highlightPosition = null,
  onHighlight,
}: {
  seats: readonly SeatPlacement[];
  highlightPosition?: number | null;
  onHighlight?: (position: number | null) => void;
}) {
  const placed = useMemo(() => placeGalaxy(seats), [seats]);
  const clipBase = useId().replace(/:/g, "");
  const surfaceRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [localHighlight, setLocalHighlight] = useState<number | null>(null);
  const activeHighlight = onHighlight ? highlightPosition : localHighlight;
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const selected = placed.find((hex) => `${hex.q},${hex.r}` === selectedKey) ?? null;
  const selectedSeat = selected?.position ? seats.find((seat) => seat.position === selected.position) : null;
  const sliceStats = selectedSeat && selectedSeat.tileIds.some(Boolean) ? buildSliceStats(selectedSeat.tileIds) : null;

  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.min(2.8, Math.max(0.65, scale * Math.exp(-event.deltaY * 0.001)));
      setScale(next);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [scale]);

  function zoom(direction: number) {
    setScale((current) => Math.min(2.8, Math.max(0.65, current + direction * 0.2)));
  }

  function resetView() {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  async function saveMap() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(FRAME.width));
    clone.setAttribute("height", String(FRAME.height));
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = "text { font-family: Outfit, sans-serif; }";
    clone.insertBefore(style, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The map image could not be created."));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(FRAME.width * 2);
      canvas.height = Math.round(FRAME.height * 2);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#070b14";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(2, 2);
      context.drawImage(image, 0, 0);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "ti4-galaxy.png";
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function selectHex(hex: PlacedHex) {
    setSelectedKey(`${hex.q},${hex.r}`);
    if (hex.role !== "main" && hex.role !== "minor") return;
    if (onHighlight) onHighlight(hex.position);
    else setLocalHighlight(hex.position);
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0c1222] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-[#e4c27a]">Galaxy</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" className="min-h-10 px-3" onClick={() => zoom(1)}>
            Zoom in
          </Button>
          <Button type="button" variant="ghost" className="min-h-10 px-3" onClick={() => zoom(-1)}>
            Zoom out
          </Button>
          <Button type="button" variant="ghost" className="min-h-10 px-3" onClick={resetView}>
            Reset view
          </Button>
          <Button type="button" variant="ghost" className="min-h-10 px-3" onClick={() => void saveMap()}>
            Save galaxy map
          </Button>
        </div>
      </div>
      <div
        ref={surfaceRef}
        className="relative mt-3 h-[68vh] min-h-[420px] overflow-hidden rounded-2xl bg-[#070b14] touch-none"
        onPointerDown={(event) => {
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          event.currentTarget.setPointerCapture(event.pointerId);
          if (pointers.current.size === 2) {
            const [first, second] = [...pointers.current.values()];
            pinch.current = { distance: Math.hypot((first?.x ?? 0) - (second?.x ?? 0), (first?.y ?? 0) - (second?.y ?? 0)), scale };
            drag.current = null;
            return;
          }
          drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
        }}
        onPointerMove={(event) => {
          if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.current.size === 2 && pinch.current) {
            const [first, second] = [...pointers.current.values()];
            const distance = Math.hypot((first?.x ?? 0) - (second?.x ?? 0), (first?.y ?? 0) - (second?.y ?? 0));
            const next = Math.min(2.8, Math.max(0.65, pinch.current.scale * (distance / pinch.current.distance)));
            setScale(next);
            return;
          }
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          if (Math.hypot(dx, dy) > 6) drag.current.moved = true;
          if (drag.current.moved) setPan({ x: drag.current.panX + dx, y: drag.current.panY + dy });
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          if (drag.current?.moved) ignoreClick.current = true;
          drag.current = null;
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          pinch.current = null;
          drag.current = null;
        }}
      >
        <div className="flex h-full w-full items-center justify-center" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
          <svg
            ref={svgRef}
            viewBox={`${FRAME.minX} ${FRAME.minY} ${FRAME.width} ${FRAME.height}`}
            className="h-full max-h-full w-full font-sans"
            role="img"
            aria-label="Thirty-seven hex galaxy"
          >
            <rect x={FRAME.minX} y={FRAME.minY} width={FRAME.width} height={FRAME.height} fill="#070b14" />
            <defs>
              {placed.map((hex) => (
                <clipPath id={`${clipBase}-${hex.q}-${hex.r}`} key={`${hex.q}-${hex.r}`}>
                  <polygon points={HEX_POINTS} />
                </clipPath>
              ))}
            </defs>
            {placed.map((hex) => {
              const center = hexPixel(hex.q, hex.r);
              const tile = hex.tileId ? lookupTile(hex.tileId) : hex.homeTileId ? lookupTile(hex.homeTileId) : null;
              const tone = face(hex, hex.role === "system" ? tile : null);
              const dimmed = activeHighlight !== null && hex.position !== null && hex.position !== activeHighlight;
              const emphasized = activeHighlight !== null && hex.position === activeHighlight;
              const label =
                hex.role === "mecatol"
                  ? "Mecatol Rex"
                  : hex.tileId
                    ? `Tile ${hex.tileId}`
                    : hex.factionName
                      ? hex.factionName
                      : hex.role === "main"
                        ? "Home system"
                        : hex.role === "minor"
                          ? "Minor home"
                          : "Empty system";
              return (
                <g
                  key={`${hex.q},${hex.r}:${hex.tileId ?? ""}:${hex.factionName ?? ""}`}
                  transform={`translate(${center.x.toFixed(2)} ${center.y.toFixed(2)})`}
                  opacity={dimmed ? 0.32 : 1}
                  className={hex.tileId ? "hex-in" : undefined}
                >
                  <g clipPath={`url(#${clipBase}-${hex.q}-${hex.r})`}>
                    <polygon points={HEX_POINTS} fill={tone.fill} />
                    {tile && hex.role === "system" ? <AnomalyMarks tile={tile} /> : null}
                    <HexLabel hex={hex} tile={tile} ink={tone.ink} />
                    <text y={HEX_SIZE - 10} textAnchor="middle" fill={tone.ink} fontSize="8" opacity="0.8">
                      {hex.role === "main" && hex.playerName ? shorten(hex.playerName, 12) : ""}
                    </text>
                  </g>
                  <polygon
                    points={HEX_POINTS}
                    fill="none"
                    stroke={emphasized ? "#f6e7c1" : tone.stroke}
                    strokeWidth={emphasized ? 4 : hex.playerName ? 2.5 : 1.5}
                    strokeDasharray={!hex.tileId && hex.role === "system" ? "4 3" : undefined}
                  />
                  <polygon
                    points={HEX_POINTS}
                    fill="transparent"
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (ignoreClick.current) {
                        ignoreClick.current = false;
                        return;
                      }
                      selectHex(hex);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectHex(hex);
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {selected ? (
        <div className="mt-3">
          {selected.playerName ? (
            <p className="text-sm text-[#e4c27a]">
              {selected.playerName}
              {selected.position ? ` · Position ${selected.position} ${POSITION_LABELS[selected.position] ?? ""}` : ""}
              {selected.sliceName ? ` · ${selected.sliceName}` : ""}
            </p>
          ) : selected.position ? (
            <p className="text-sm text-white/60">Position {selected.position} is open.</p>
          ) : null}
          {selected.legacy ? <p className="text-xs text-[#ffe3a3]">This seat still uses an older five-tile slice. Those systems stay on the slice card.</p> : null}
          {sliceStats && (selected.role === "main" || selected.role === "minor") ? (
            <p className="text-xs leading-5 text-white/70">
              {sliceStats.resources} resources · {sliceStats.influence} influence · Optimal {formatStat(sliceStats.optimalResources)} / {formatStat(sliceStats.optimalInfluence)}
              {sliceStats.specialties.length ? ` · Tech ${sliceStats.specialties.join(", ")}` : ""}
              {sliceStats.wormholes.length ? ` · ${sliceStats.wormholes.map(labelWormhole).join(", ")}` : ""}
              {sliceStats.legendary.length ? ` · Legendary ${sliceStats.legendary.join(", ")}` : ""}
            </p>
          ) : null}
          <TileDetail
            tile={selected.tileId ? lookupTile(selected.tileId) : selected.homeTileId ? lookupTile(selected.homeTileId) : null}
            tileId={selected.tileId || selected.homeTileId || ""}
            heading={selected.factionName ?? (selected.role === "mecatol" ? "Mecatol Rex" : undefined)}
            emptyNote={
              selected.factionName && !selected.homeTileId
                ? "This faction's home system is not in the local catalog. Only the name is shown."
                : selected.role === "main"
                  ? "Main home. The faction is recorded after the physical coin flips."
                  : selected.role === "minor"
                    ? "Minor home. This faction belongs to the player across the galaxy."
                    : undefined
            }
            onClose={() => setSelectedKey(null)}
          />
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-white/50">Drag to pan. Scroll or pinch to zoom. Tap a system for its planets. Tap a home system to highlight that slice.</p>
      )}
    </section>
  );
}

function HexLabel({ hex, tile, ink }: { hex: PlacedHex; tile: SystemTile | null; ink: string }) {
  if (hex.role === "mecatol") {
    return (
      <text y="4" textAnchor="middle" fill="#e4c27a" fontSize="11" fontWeight="700">
        Mecatol
      </text>
    );
  }
  if (hex.role === "main" || hex.role === "minor") {
    const title = hex.factionName ?? (hex.role === "main" ? "HOME" : "MINOR");
    return (
      <g>
        <text y={hex.factionName ? -2 : 4} textAnchor="middle" fill={ink} fontSize="9" fontWeight="700">
          {shorten(title, 12)}
        </text>
        <text y="12" textAnchor="middle" fill="#e4c27a" fontSize="8">
          {hex.role === "main" ? "Main" : "Minor"}
        </text>
      </g>
    );
  }
  const planet = tile?.planets[0];
  const anomaly = tile?.anomalies[0] ? labelAnomaly(tile.anomalies[0]) : tile?.wormholes[0] ? labelWormhole(tile.wormholes[0]) : "";
  return (
    <g>
      <text y={planet || anomaly ? -6 : 4} textAnchor="middle" fill="#e4c27a" fontSize="12" fontWeight="700">
        {hex.tileId ?? ""}
      </text>
      {planet ? (
        <text y="10" textAnchor="middle" fill={ink} fontSize="8">
          {shorten(planet.name, 11)} {planet.resources}/{planet.influence}
        </text>
      ) : anomaly ? (
        <text y="10" textAnchor="middle" fill={ink} fontSize="8">
          {shorten(anomaly, 12)}
        </text>
      ) : null}
      {tile?.wormholes[0] ? (
        <text y="22" textAnchor="middle" fill="#9ad7ff" fontSize="9">
          {WORMHOLE_GLYPH[tile.wormholes[0]] ?? "W"}
        </text>
      ) : null}
      {tile?.planets.some((item) => item.legendary) ? (
        <text x="16" y="-14" textAnchor="middle" fill="#e4c27a" fontSize="10">
          ★
        </text>
      ) : null}
    </g>
  );
}

function AnomalyMarks({ tile }: { tile: SystemTile }) {
  if (tile.anomalies.includes("asteroid-field")) {
    return (
      <g>
        <circle cx="-8" cy="2" r="3" fill="#6b6258" />
        <circle cx="7" cy="-4" r="2.4" fill="#8a8174" />
      </g>
    );
  }
  if (tile.anomalies.includes("nebula")) return <ellipse cx="0" cy="2" rx="14" ry="8" fill="#7a5cff" opacity="0.45" />;
  if (tile.anomalies.includes("supernova") || tile.anomalies.includes("muaat-supernova")) {
    return <circle cx="0" cy="2" r="7" fill="#ffb45a" opacity="0.8" />;
  }
  if (tile.anomalies.includes("gravity-rift")) return <path d="M-12 10 C-2 2 4 -4 12-12" fill="none" stroke="#9ad7ff" strokeWidth="2" />;
  return null;
}
