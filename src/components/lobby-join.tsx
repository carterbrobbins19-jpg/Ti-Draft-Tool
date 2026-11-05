"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyLink } from "@/components/host-menu";
import { Button, Header, LoadingScreen, Notice, Shell } from "@/components/ui";
import { claimLobbySeat, previewLobby } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { supabaseEnv } from "@/lib/supabase";
import type { LobbyPreview } from "@/lib/types";

export function LobbyJoin({ code }: { code: string }) {
  const router = useRouter();
  const configured = Boolean(supabaseEnv());
  const [lobby, setLobby] = useState<LobbyPreview | null>(null);
  const [error, setError] = useState<string | null>(
    configured ? null : "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
  );
  const [loading, setLoading] = useState(configured);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    async function load() {
      try {
        const next = await previewLobby(code);
        if (!cancelled) {
          setLobby(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [code, configured]);

  async function claim(playerId: string) {
    setBusyId(playerId);
    setError(null);
    try {
      const result = await claimLobbySeat(code, playerId);
      router.push(`/draft/${result.lobby_code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusyId(null);
    }
  }

  if (loading) return <LoadingScreen label="Opening lobby" />;

  const mine = lobby?.players.find((player) => player.mine);

  return (
    <Shell>
      <Header code={code} />
      <section className="rounded-3xl border border-[#e4c27a]/25 bg-[#12182a]/90 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">{lobby?.title ?? "TI4 Draft"}</p>
        <h1 className="mt-1 font-mono text-3xl tracking-[0.28em] text-[#e4c27a]">{code}</h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          Claim one open seat. This code only opens the lobby. It does not let you pick for anyone else or use host controls.
        </p>
        <p className="mt-2 text-sm text-white/55">{lobby ? `${lobby.claimed_count} of 6 seats claimed` : "Looking up the room"}</p>
        <div className="mt-3">
          <CopyLink label="Lobby link" path={`/join/${code}`} />
        </div>
        {lobby?.lobby_locked ? (
          <div className="mt-3">
            <Notice tone="info">The host has locked new seat claims.</Notice>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <Notice>{error}</Notice>
          </div>
        ) : null}
        {mine || lobby?.is_host ? (
          <Button className="mt-4 w-full sm:w-auto" onClick={() => router.push(`/draft/${code}`)}>
            {mine ? `Enter as ${mine.name}` : "Open host table"}
          </Button>
        ) : null}
      </section>
      <ul className="grid gap-2">
        {(lobby?.players ?? []).map((player) => {
          const taken = player.claimed && !player.mine;
          const locked = lobby?.lobby_locked && !player.mine;
          return (
            <li key={player.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#12182a]/80 px-3 py-3">
              <span>
                <span className="block font-semibold">{player.name}</span>
                <span className="text-xs text-white/45">Seat {player.seat_index}</span>
              </span>
              {player.mine ? (
                <span className="text-xs text-[#e4c27a]">Your seat</span>
              ) : (
                <Button className="min-h-12" variant="ghost" disabled={Boolean(busyId) || taken || Boolean(locked) || Boolean(mine)} onClick={() => void claim(player.id)}>
                  {busyId === player.id ? "Claiming..." : taken ? "Claimed" : "Claim seat"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
