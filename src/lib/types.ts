export const PLAYER_COUNT = 6;
export const PICKS_PER_PLAYER = 4;
export const TOTAL_PICKS = PLAYER_COUNT * PICKS_PER_PLAYER;

export type DraftStatus = "lobby" | "active" | "paused" | "complete" | "revealed";
export type PickCategory = "faction" | "slice" | "position";

export type DraftRow = {
  id: string;
  lobby_code: string;
  host_user_id: string;
  status: DraftStatus;
  next_pick: number;
  created_at: string;
  revealed_at: string | null;
};

export type PlayerRow = {
  id: string;
  draft_id: string;
  seat_index: number;
  name: string;
  draft_order: number;
  user_id: string | null;
  slice_id: string | null;
  position_number: number | null;
  main_faction_id: string | null;
  minor_faction_id: string | null;
};

export type FactionRow = {
  id: string;
  draft_id: string;
  name: string;
  image_url: string | null;
  expansion: string | null;
  sort_order: number;
};

export type SliceRow = {
  id: string;
  draft_id: string;
  name: string;
  image_url: string | null;
  planets: string[];
  total_resources: number;
  total_influence: number;
  special_notes: string | null;
  sort_order: number;
};

export type PickRow = {
  id: string;
  draft_id: string;
  player_id: string;
  pick_number: number;
  category: PickCategory;
  faction_id: string | null;
  slice_id: string | null;
  position_number: number | null;
  created_at: string;
};

export type FactionDraft = {
  name: string;
  image_url: string | null;
  expansion: string | null;
};

export type SliceDraft = {
  name: string;
  image_url: string | null;
  planets: string[];
  total_resources: number;
  total_influence: number;
  special_notes: string | null;
};

export type InviteLink = {
  player_id: string;
  name: string;
  seat_index: number;
  token: string;
  claimed: boolean;
};

export type HostSecrets = {
  host_token: string;
  invites: InviteLink[];
};

export type DraftRoom = {
  draft: DraftRow;
  players: PlayerRow[];
  factions: FactionRow[];
  slices: SliceRow[];
  picks: PickRow[];
  secrets: HostSecrets | null;
  userId: string;
};

export type PickChoice =
  | { category: "faction"; factionId: string }
  | { category: "slice"; sliceId: string }
  | { category: "position"; position: number };
