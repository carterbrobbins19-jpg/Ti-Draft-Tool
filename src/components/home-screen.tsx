"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Header, Notice, Shell, TextInput } from "@/components/ui";
import { createDraft } from "@/lib/api";
import { DEFAULT_PLAYER_NAMES, FACTION_CATALOG, PLACEHOLDER_SLICES } from "@/lib/defaults";
import { errorMessage } from "@/lib/errors";
import { supabaseEnv } from "@/lib/supabase";

export function HomeScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = Boolean(supabaseEnv());

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const draft = await createDraft(DEFAULT_PLAYER_NAMES, FACTION_CATALOG, PLACEHOLDER_SLICES);
      router.push(`/draft/${draft.lobby_code}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Header />
      <section className="rounded-[2rem] border border-[#e4c27a]/25 bg-[#12182a]/90 px-5 py-8 sm:px-8">
        <p className="text-xs uppercase tracking-[0.22em] text-[#e4c27a]">Six-player snake draft</p>
        <h1 className="mt-3 max-w-xl font-display text-4xl leading-tight sm:text-5xl">Factions, slices, and seats.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/75">
          Each player drafts two factions, one map slice, and one table position. On game day the host reveals which faction is played and which becomes the minor faction across the table.
        </p>
        {!configured ? (
          <div className="mt-5">
            <Notice>Add your Supabase URL and anon key to .env.local before creating a table.</Notice>
          </div>
        ) : null}
        {error ? (
          <div className="mt-5">
            <Notice>{error}</Notice>
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button className="sm:min-w-48" disabled={busy || !configured} onClick={() => void create()}>
            {busy ? "Creating table..." : "Create draft"}
          </Button>
        </div>
      </section>
      <section className="rounded-3xl border border-white/10 bg-[#12182a]/80 p-4">
        <h2 className="font-display text-xl">Return to a table</h2>
        <p className="mt-1 text-sm text-white/60">Players should open their personal invite link. The table code is for the host.</p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const next = code.trim().toUpperCase();
            if (next) router.push(`/draft/${next}`);
          }}
        >
          <TextInput value={code} onChange={(event) => setCode(event.target.value)} placeholder="Table code" aria-label="Table code" />
          <Button type="submit" variant="ghost">
            Open
          </Button>
        </form>
      </section>
    </Shell>
  );
}
