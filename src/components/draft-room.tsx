"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { LiveDraft } from "@/components/live-draft";
import { LobbyPanel } from "@/components/lobby-panel";
import { ResultsView } from "@/components/results-view";
import { Header, LoadingScreen, Notice, Shell } from "@/components/ui";
import { loadDraft } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { getSupabase, supabaseEnv } from "@/lib/supabase";
import type { DraftRoom as Room, DraftStatus } from "@/lib/types";

export function DraftRoom() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code ?? "").trim().toUpperCase();
  const configured = Boolean(supabaseEnv());
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(
    configured ? null : "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);
  const [connection, setConnection] = useState<"live" | "reconnecting" | "offline">("reconnecting");
  const [animateReveal, setAnimateReveal] = useState(false);
  const requestRef = useRef(0);
  const statusRef = useRef<DraftStatus | null>(null);
  const roomRef = useRef<Room | null>(null);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const next = await loadDraft(code);
      if (request !== requestRef.current) return;
      if (statusRef.current && statusRef.current !== "revealed" && next?.draft.status === "revealed") {
        setAnimateReveal(true);
      }
      statusRef.current = next?.draft.status ?? null;
      roomRef.current = next;
      setRoom(next);
      setError(null);
    } catch (err) {
      if (request !== requestRef.current) return;
      const message = errorMessage(err);
      if (roomRef.current) setBanner(message);
      else setError(message);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (!configured) return;
    const kickoff = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 12000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOffline = () => setConnection("offline");
    const onOnline = () => {
      setConnection("reconnecting");
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [configured, refresh]);

  const draftId = room?.draft.id;
  useEffect(() => {
    if (!draftId || !supabaseEnv()) return;
    const supabase = getSupabase();
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 80);
    };
    const channel = supabase
      .channel(`draft-${draftId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `id=eq.${draftId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `draft_id=eq.${draftId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "factions", filter: `draft_id=eq.${draftId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "slices", filter: `draft_id=eq.${draftId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "draft_picks", filter: `draft_id=eq.${draftId}` }, schedule)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConnection("reconnecting");
      });
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [draftId, refresh]);

  if (loading) return <LoadingScreen label="Opening the draft" />;
  if (!room) {
    return (
      <Shell>
        <Header />
        <Notice>{error ?? "This draft is unavailable. Open the personal invite link from the host."}</Notice>
      </Shell>
    );
  }

  const me = room.players.find((player) => player.user_id === room.userId);
  const detail =
    room.draft.host_user_id === room.userId
      ? me
        ? `Host, seated as ${me.name}`
        : "You are the host"
      : me
        ? `Seated as ${me.name}`
        : undefined;

  return (
    <Shell>
      <Header code={room.draft.lobby_code} detail={detail} connection={connection} />
      {banner ? <Notice>{banner}</Notice> : null}
      {room.draft.status === "lobby" ? <LobbyPanel room={room} refresh={refresh} report={setBanner} /> : null}
      {room.draft.status === "active" || room.draft.status === "paused" ? (
        <LiveDraft room={room} refresh={refresh} report={setBanner} />
      ) : null}
      {room.draft.status === "complete" || room.draft.status === "revealed" ? (
        <ResultsView room={room} animate={animateReveal} refresh={refresh} report={setBanner} />
      ) : null}
    </Shell>
  );
}
