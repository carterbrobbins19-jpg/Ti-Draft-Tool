"use client";

import { useState } from "react";
import { resetSeat, setPaused, undoLastPick } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { DraftRoom, InviteLink } from "@/lib/types";
import { Button } from "@/components/ui";

export function HostMenu({
  room,
  refresh,
  report,
}: {
  room: DraftRoom;
  refresh: () => Promise<void>;
  report: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (room.draft.host_user_id !== room.userId || !room.secrets) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    report(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      report(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-3xl border border-[#e4c27a]/30 bg-[#12182a]/90 p-4">
      <summary className="cursor-pointer font-display text-lg text-[#e4c27a]">Host controls</summary>
      <div className="mt-4 grid gap-3">
        {room.draft.status === "active" ? (
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => setPaused(room.draft.id, true))}>
            Pause draft
          </Button>
        ) : null}
        {room.draft.status === "paused" ? (
          <Button disabled={busy} onClick={() => void run(() => setPaused(room.draft.id, false))}>
            Resume draft
          </Button>
        ) : null}
        {room.draft.status !== "revealed" && room.draft.status !== "lobby" ? (
          <Button
            variant="danger"
            disabled={busy || room.picks.length === 0}
            onClick={() => {
              if (!window.confirm("Remove the most recent selection?")) return;
              void run(() => undoLastPick(room.draft.id));
            }}
          >
            Undo last selection
          </Button>
        ) : null}
        <InviteList invites={room.secrets.invites} hostToken={room.secrets.host_token} />
        <div className="grid gap-2">
          {room.secrets.invites.map((invite) => (
            <div key={invite.player_id} className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2">
              <span className="text-sm">
                {invite.name}
                <span className="ml-2 text-xs text-white/45">{invite.claimed ? "Joined" : "Not joined"}</span>
              </span>
              <Button
                variant="ghost"
                className="min-h-10 px-3"
                disabled={busy || !invite.claimed}
                onClick={() => {
                  if (!window.confirm(`Reset ${invite.name}'s seat so their invite link can be used again?`)) return;
                  void run(() => resetSeat(room.draft.id, invite.player_id));
                }}
              >
                Reset seat
              </Button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export function InviteList({ invites, hostToken }: { invites: InviteLink[]; hostToken?: string }) {
  return (
    <div className="grid gap-2">
      {hostToken ? <CopyRow label="Host recovery link" path={`/host/${hostToken}`} /> : null}
      {invites.map((invite) => (
        <CopyRow key={invite.player_id} label={`${invite.name} invite`} path={`/join/${invite.token}`} />
      ))}
    </div>
  );
}

function CopyRow({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2">
      <span className="text-sm">{label}</span>
      <Button
        variant="ghost"
        className="min-h-10 px-3"
        onClick={() => {
          const url = `${window.location.origin}${path}`;
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
