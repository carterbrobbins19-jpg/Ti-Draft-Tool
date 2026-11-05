import {
  PLAYER_COUNT,
  TOTAL_PICKS,
  type DraftStatus,
  type PickCategory,
  type PickChoice,
} from "@/lib/types";

export type EnginePlayer = {
  id: string;
  name: string;
  draftOrder: number;
  userId: string | null;
  factionIds: string[];
  sliceId: string | null;
  position: number | null;
  mainFactionId: string | null;
  minorFactionId: string | null;
};

export type EnginePick = {
  pickNumber: number;
  playerId: string;
  category: PickCategory;
  factionId: string | null;
  sliceId: string | null;
  position: number | null;
};

export type EngineState = {
  hostUserId: string;
  status: DraftStatus;
  nextPick: number;
  factionIds: string[];
  sliceIds: string[];
  players: EnginePlayer[];
  picks: EnginePick[];
};

const OPPOSITES: Record<number, number> = {
  1: 4,
  2: 5,
  3: 6,
  4: 1,
  5: 2,
  6: 3,
};

export function snakeDraftOrder(pickNumber: number): number {
  if (pickNumber < 1 || pickNumber > TOTAL_PICKS) {
    throw new Error("Pick number must be between 1 and 24");
  }
  const round = Math.ceil(pickNumber / PLAYER_COUNT);
  const index = (pickNumber - 1) % PLAYER_COUNT;
  return round % 2 === 1 ? index + 1 : PLAYER_COUNT - index;
}

export function roundForPick(pickNumber: number): number {
  return Math.ceil(pickNumber / PLAYER_COUNT);
}

export function oppositePosition(position: number): number {
  const opposite = OPPOSITES[position];
  if (!opposite) throw new Error("Position must be 1 through 6");
  return opposite;
}

export function currentTurn(state: EngineState): EnginePlayer | null {
  if (state.status !== "active" && state.status !== "paused") return null;
  if (state.nextPick < 1 || state.nextPick > TOTAL_PICKS) return null;
  const order = snakeDraftOrder(state.nextPick);
  return state.players.find((player) => player.draftOrder === order) ?? null;
}

export function upcomingTurn(state: EngineState): EnginePlayer | null {
  if (state.status !== "active" && state.status !== "paused") return null;
  if (state.nextPick < 1 || state.nextPick >= TOTAL_PICKS) return null;
  const order = snakeDraftOrder(state.nextPick + 1);
  return state.players.find((player) => player.draftOrder === order) ?? null;
}

export function displayProgress(state: EngineState): { pick: number; round: number } {
  if (state.status === "lobby") return { pick: 0, round: 0 };
  if (state.nextPick > TOTAL_PICKS) return { pick: TOTAL_PICKS, round: 4 };
  return { pick: state.nextPick, round: roundForPick(state.nextPick) };
}

export function selectionBlocker(
  state: EngineState,
  actorUserId: string,
  choice: PickChoice,
): string | null {
  if (state.status === "lobby") return "The draft has not started";
  if (state.status === "paused") return "The draft is paused";
  if (state.status === "complete" || state.status === "revealed") return "The draft is finished";
  if (state.nextPick < 1 || state.nextPick > TOTAL_PICKS) return "The draft is finished";

  const order = snakeDraftOrder(state.nextPick);
  const player = state.players.find((entry) => entry.draftOrder === order);
  if (!player) return "The current seat is missing";
  if (!player.userId) return "This seat has not been claimed yet";
  if (player.userId !== actorUserId) return "It is not your turn";

  const mine = state.picks.filter((pick) => pick.playerId === player.id);
  if (choice.category === "faction") {
    if (mine.filter((pick) => pick.category === "faction").length >= 2) {
      return "You already drafted two factions";
    }
    if (!state.factionIds.includes(choice.factionId)) return "That faction is not available";
    if (state.picks.some((pick) => pick.factionId === choice.factionId)) {
      return "That faction has already been drafted";
    }
    return null;
  }

  if (choice.category === "slice") {
    if (mine.some((pick) => pick.category === "slice")) return "You already drafted a slice";
    if (!state.sliceIds.includes(choice.sliceId)) return "That slice is not available";
    if (state.picks.some((pick) => pick.sliceId === choice.sliceId)) {
      return "That slice has already been drafted";
    }
    return null;
  }

  if (mine.some((pick) => pick.category === "position")) return "You already drafted a position";
  if (choice.position < 1 || choice.position > PLAYER_COUNT) return "Position must be 1 through 6";
  if (state.picks.some((pick) => pick.position === choice.position)) {
    return "That position has already been drafted";
  }
  return null;
}

export function applyPick(state: EngineState, actorUserId: string, choice: PickChoice): EngineState {
  const problem = selectionBlocker(state, actorUserId, choice);
  if (problem) throw new Error(problem);

  const order = snakeDraftOrder(state.nextPick);
  const player = state.players.find((entry) => entry.draftOrder === order);
  if (!player) throw new Error("The current seat is missing");

  const pick: EnginePick = {
    pickNumber: state.nextPick,
    playerId: player.id,
    category: choice.category,
    factionId: choice.category === "faction" ? choice.factionId : null,
    sliceId: choice.category === "slice" ? choice.sliceId : null,
    position: choice.category === "position" ? choice.position : null,
  };

  const players = state.players.map((entry) => {
    if (entry.id !== player.id) return entry;
    if (choice.category === "faction") {
      return { ...entry, factionIds: [...entry.factionIds, choice.factionId] };
    }
    if (choice.category === "slice") return { ...entry, sliceId: choice.sliceId };
    return { ...entry, position: choice.position };
  });

  const finished = state.nextPick === TOTAL_PICKS;
  return {
    ...state,
    status: finished ? "complete" : state.status,
    nextPick: finished ? TOTAL_PICKS + 1 : state.nextPick + 1,
    players,
    picks: [...state.picks, pick],
  };
}

export function revealDraft(
  state: EngineState,
  actorUserId: string,
  rng: () => number,
): EngineState {
  if (actorUserId !== state.hostUserId) throw new Error("Only the host can reveal factions");
  if (state.status === "revealed") return state;
  if (state.status !== "complete") throw new Error("Finish the draft before revealing");

  const players = [...state.players]
    .sort((a, b) => a.draftOrder - b.draftOrder)
    .map((player) => {
      const factions = state.picks
        .filter((pick) => pick.playerId === player.id && pick.category === "faction")
        .sort((a, b) => a.pickNumber - b.pickNumber);
      const slice = state.picks.find((pick) => pick.playerId === player.id && pick.category === "slice");
      const position = state.picks.find(
        (pick) => pick.playerId === player.id && pick.category === "position",
      );
      if (factions.length !== 2 || !slice?.sliceId || !position?.position) {
        throw new Error("The draft is incomplete");
      }
      const flip = rng();
      if (flip < 0 || flip >= 1) throw new Error("Random source must return a value from 0 up to 1");
      const firstIsMain = flip < 0.5;
      return {
        ...player,
        sliceId: slice.sliceId,
        position: position.position,
        mainFactionId: firstIsMain ? factions[0].factionId : factions[1].factionId,
        minorFactionId: firstIsMain ? factions[1].factionId : factions[0].factionId,
      };
    });

  const byId = new Map(players.map((player) => [player.id, player]));
  return {
    ...state,
    status: "revealed",
    players: state.players.map((player) => byId.get(player.id) ?? player),
  };
}

type RoomLike = {
  draft: { host_user_id: string; status: DraftStatus; next_pick: number };
  players: { id: string; name: string; draft_order: number; user_id: string | null }[];
  factions: { id: string }[];
  slices: { id: string }[];
  picks: {
    pick_number: number;
    player_id: string;
    category: PickCategory;
    faction_id: string | null;
    slice_id: string | null;
    position_number: number | null;
  }[];
};

export function roomToEngine(room: RoomLike): EngineState {
  const picks = [...room.picks].sort((a, b) => a.pick_number - b.pick_number);
  return {
    hostUserId: room.draft.host_user_id,
    status: room.draft.status,
    nextPick: room.draft.next_pick,
    factionIds: room.factions.map((faction) => faction.id),
    sliceIds: room.slices.map((slice) => slice.id),
    picks: picks.map((pick) => ({
      pickNumber: pick.pick_number,
      playerId: pick.player_id,
      category: pick.category,
      factionId: pick.faction_id,
      sliceId: pick.slice_id,
      position: pick.position_number,
    })),
    players: [...room.players]
      .sort((a, b) => a.draft_order - b.draft_order)
      .map((player) => ({
        id: player.id,
        name: player.name,
        draftOrder: player.draft_order,
        userId: player.user_id,
        factionIds: picks
          .filter((pick) => pick.player_id === player.id && pick.category === "faction")
          .map((pick) => pick.faction_id)
          .filter((id): id is string => Boolean(id)),
        sliceId: picks.find((pick) => pick.player_id === player.id && pick.category === "slice")?.slice_id ?? null,
        position:
          picks.find((pick) => pick.player_id === player.id && pick.category === "position")?.position_number ??
          null,
        mainFactionId: null,
        minorFactionId: null,
      })),
  };
}
