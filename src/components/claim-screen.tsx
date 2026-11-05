"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Header, LoadingScreen, Notice, Shell } from "@/components/ui";
import { LobbyJoin } from "@/components/lobby-join";
import { claimHost, claimSeat, previewInvite } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { isRoomCode, normalizeRoomCode } from "@/lib/lobby";
import { supabaseEnv } from "@/lib/supabase";

export function ClaimScreen({ kind }: { kind: "seat" | "host" }) {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params.token ?? "").trim();
  const shared = kind === "seat" && isRoomCode(token);
  const router = useRouter();
  const configured = Boolean(supabaseEnv());
  const [preview, setPreview] = useState<{ player_name: string; claimed: boolean; lobby_code: string } | null>(null);
  const [error, setError] = useState<string | null>(
    configured ? null : "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
  );
  const [loading, setLoading] = useState(configured && kind === "seat" && !shared);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured || kind === "host" || shared) return;
    let cancelled = false;
    void previewInvite(token)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, kind, shared, token]);

  if (shared) return <LobbyJoin code={normalizeRoomCode(token)} />;

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const result = kind === "host" ? await claimHost(token) : await claimSeat(token);
      router.push(`/draft/${result.lobby_code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loading) return <LoadingScreen label="Checking invite" />;

  return (
    <Shell>
      <Header />
      <section className="rounded-3xl border border-[#e4c27a]/25 bg-[#12182a]/90 p-5">
        <h1 className="font-display text-3xl">{kind === "host" ? "Restore host controls" : `Join as ${preview?.player_name ?? "player"}`}</h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          {kind === "host"
            ? "This link attaches host controls to this browser. Keep it private. It does not draft a seat by itself."
            : preview?.claimed
              ? "This seat may already be claimed. If it is yours, you can enter the table. Otherwise ask the host to reset the seat."
              : "This invite claims one seat for this browser. You cannot pick for anyone else."}
        </p>
        {error ? (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        ) : null}
        <Button className="mt-5 w-full sm:w-auto" disabled={busy || !configured || (!preview && kind === "seat")} onClick={() => void claim()}>
          {busy ? "Joining..." : kind === "host" ? "Continue as host" : "Take this seat"}
        </Button>
      </section>
    </Shell>
  );
}
