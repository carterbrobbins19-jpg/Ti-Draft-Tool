import { errorMessage } from "@/lib/errors";
import { ensureSession, getSupabase } from "@/lib/supabase";
import type { DraftRoom, FactionDraft, HostSecrets, SliceDraft } from "@/lib/types";

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

export async function createDraft(names: string[], factions: FactionDraft[], slices: SliceDraft[]) {
  await ensureSession();
  return callRpc<{ draft_id: string; lobby_code: string; host_token: string }>("create_draft", {
    p_names: names,
    p_factions: factions,
    p_slices: slices,
  });
}

export async function updateSetup(
  draftId: string,
  players: { id: string; name: string }[],
  factions: FactionDraft[],
  slices: SliceDraft[],
) {
  await ensureSession();
  return callRpc("update_setup", {
    p_draft_id: draftId,
    p_players: players,
    p_factions: factions,
    p_slices: slices,
  });
}

export async function startDraft(draftId: string) {
  await ensureSession();
  return callRpc("start_draft", { p_draft_id: draftId });
}

export async function setPaused(draftId: string, paused: boolean) {
  await ensureSession();
  return callRpc("set_paused", { p_draft_id: draftId, p_paused: paused });
}

export async function resetSeat(draftId: string, playerId: string) {
  await ensureSession();
  return callRpc("reset_seat", { p_draft_id: draftId, p_player_id: playerId });
}

export async function submitPick(draftId: string, category: "faction" | "slice" | "position", item: string) {
  await ensureSession();
  return callRpc("submit_pick", { p_draft_id: draftId, p_category: category, p_item: item });
}

export async function undoLastPick(draftId: string) {
  await ensureSession();
  return callRpc("undo_last_pick", { p_draft_id: draftId });
}

export async function revealFactions(draftId: string) {
  await ensureSession();
  return callRpc("reveal_factions", { p_draft_id: draftId });
}

export async function getHostSecrets(draftId: string): Promise<HostSecrets> {
  await ensureSession();
  return callRpc<HostSecrets>("get_host_secrets", { p_draft_id: draftId });
}

export async function previewInvite(token: string) {
  await ensureSession();
  return callRpc<{
    lobby_code: string;
    player_name: string;
    seat_index: number;
    claimed: boolean;
    status: string;
  }>("preview_invite", { p_token: token });
}

export async function claimSeat(token: string) {
  await ensureSession();
  return callRpc<{ lobby_code: string; player_id: string; player_name: string }>("claim_seat", {
    p_token: token,
  });
}

export async function claimHost(token: string) {
  await ensureSession();
  return callRpc<{ lobby_code: string }>("claim_host", { p_token: token });
}

export async function loadDraft(code: string): Promise<DraftRoom | null> {
  const userId = await ensureSession();
  const supabase = getSupabase();
  const draftResult = await supabase.from("drafts").select("*").eq("lobby_code", code).maybeSingle();
  if (draftResult.error) throw new Error(errorMessage(draftResult.error));
  if (!draftResult.data) return null;

  const draftId = draftResult.data.id as string;
  const [players, factions, slices, picks] = await Promise.all([
    supabase.from("players").select("*").eq("draft_id", draftId).order("draft_order"),
    supabase.from("factions").select("*").eq("draft_id", draftId).order("sort_order"),
    supabase.from("slices").select("*").eq("draft_id", draftId).order("sort_order"),
    supabase.from("draft_picks").select("*").eq("draft_id", draftId).order("pick_number"),
  ]);
  for (const result of [players, factions, slices, picks]) {
    if (result.error) throw new Error(errorMessage(result.error));
  }

  let secrets: HostSecrets | null = null;
  if (draftResult.data.host_user_id === userId) {
    secrets = await getHostSecrets(draftId);
  }

  return {
    draft: draftResult.data,
    players: players.data ?? [],
    factions: factions.data ?? [],
    slices: slices.data ?? [],
    picks: picks.data ?? [],
    secrets,
    userId,
  };
}
