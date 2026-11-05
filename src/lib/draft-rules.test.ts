import { describe, expect, it } from "vitest";
import {
  applyPick,
  type EngineState,
  oppositePosition,
  revealDraft,
  snakeDraftOrder,
} from "@/lib/draft-rules";
import type { PickChoice } from "@/lib/types";

function makeState(): EngineState {
  return {
    hostUserId: "host",
    status: "active",
    nextPick: 1,
    factionIds: Array.from({ length: 16 }, (_, index) => `f${index + 1}`),
    sliceIds: Array.from({ length: 6 }, (_, index) => `s${index + 1}`),
    players: Array.from({ length: 6 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
      draftOrder: index + 1,
      userId: `user-${index + 1}`,
      factionIds: [],
      sliceId: null,
      position: null,
      mainFactionId: null,
      minorFactionId: null,
    })),
    picks: [],
  };
}

function userFor(state: EngineState, draftOrder: number): string {
  const player = state.players.find((entry) => entry.draftOrder === draftOrder);
  if (!player?.userId) throw new Error("missing player");
  return player.userId;
}

function act(state: EngineState, choice: PickChoice): EngineState {
  const order = snakeDraftOrder(state.nextPick);
  return applyPick(state, userFor(state, order), choice);
}

function createSerializedTable(initial: EngineState) {
  let state = initial;
  let tail = Promise.resolve();
  return {
    snapshot: () => state,
    commit(actorUserId: string, choice: PickChoice) {
      const run = tail.then(() => {
        state = applyPick(state, actorUserId, choice);
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

describe("snake draft order", () => {
  it("follows four alternating rounds", () => {
    const orders = Array.from({ length: 24 }, (_, index) => snakeDraftOrder(index + 1));
    expect(orders.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(orders.slice(6, 12)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(orders.slice(12, 18)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(orders.slice(18, 24)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it("records picks in snake order across a full draft", () => {
    let state = makeState();
    const orderLog: number[] = [];
    while (state.status === "active") {
      orderLog.push(snakeDraftOrder(state.nextPick));
      const player = state.players.find((entry) => entry.draftOrder === snakeDraftOrder(state.nextPick))!;
      const factions = state.picks.filter((pick) => pick.playerId === player.id && pick.category === "faction").length;
      const choice: PickChoice =
        factions < 2
          ? { category: "faction", factionId: state.factionIds.find((id) => !state.picks.some((pick) => pick.factionId === id))! }
          : player.sliceId
            ? { category: "position", position: [1, 2, 3, 4, 5, 6].find((position) => !state.picks.some((pick) => pick.position === position))! }
            : { category: "slice", sliceId: state.sliceIds.find((id) => !state.picks.some((pick) => pick.sliceId === id))! };
      state = applyPick(state, player.userId!, choice);
    }
    expect(orderLog).toEqual(Array.from({ length: 24 }, (_, index) => snakeDraftOrder(index + 1)));
    expect(state.status).toBe("complete");
    expect(state.picks).toHaveLength(24);
    for (const player of state.players) {
      const mine = state.picks.filter((pick) => pick.playerId === player.id);
      expect(mine.filter((pick) => pick.category === "faction")).toHaveLength(2);
      expect(mine.filter((pick) => pick.category === "slice")).toHaveLength(1);
      expect(mine.filter((pick) => pick.category === "position")).toHaveLength(1);
    }
  });
});

describe("draft restrictions", () => {
  it("rejects a player drafting on another player's turn", () => {
    expect(() => applyPick(makeState(), "user-2", { category: "faction", factionId: "f1" })).toThrow(/not your turn/i);
  });

  it("assigns the pick to the seat whose turn it is", () => {
    const next = applyPick(makeState(), "user-1", { category: "faction", factionId: "f1" });
    expect(next.picks).toHaveLength(1);
    expect(next.picks[0]?.playerId).toBe("p1");
    expect(next.picks.some((pick) => pick.playerId === "p2")).toBe(false);
  });

  it("rejects a faction that has already been drafted", () => {
    const state = applyPick(makeState(), "user-1", { category: "faction", factionId: "f1" });
    expect(() => applyPick(state, "user-2", { category: "faction", factionId: "f1" })).toThrow(/already been drafted/i);
  });

  it("rejects a third faction", () => {
    let state = makeState();
    for (let pick = 1; pick <= 12; pick += 1) {
      state = act(state, { category: "faction", factionId: `f${pick}` });
    }
    expect(state.players.find((player) => player.id === "p1")?.factionIds).toEqual(["f1", "f12"]);
    expect(() => act(state, { category: "faction", factionId: "f13" })).toThrow(/two factions/i);
  });

  it("rejects a second slice or position", () => {
    let slices = act(makeState(), { category: "slice", sliceId: "s1" });
    for (let pick = 0; pick < 10; pick += 1) slices = act(slices, { category: "faction", factionId: `f${pick + 1}` });
    expect(() => act(slices, { category: "slice", sliceId: "s2" })).toThrow(/already drafted a slice/i);

    let positions = act(makeState(), { category: "position", position: 3 });
    for (let pick = 0; pick < 10; pick += 1) positions = act(positions, { category: "faction", factionId: `f${pick + 1}` });
    expect(() => act(positions, { category: "position", position: 1 })).toThrow(/already drafted a position/i);
  });

  it("lets only one of two simultaneous commits take an item", async () => {
    const table = createSerializedTable(makeState());
    const results = await Promise.allSettled([
      table.commit("user-1", { category: "faction", factionId: "f1" }),
      table.commit("user-1", { category: "faction", factionId: "f1" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(table.snapshot().picks.filter((pick) => pick.factionId === "f1")).toHaveLength(1);
  });
});

describe("saved results", () => {
  it("keeps draft progress after a reload", () => {
    let state = makeState();
    state = act(state, { category: "faction", factionId: "f1" });
    state = act(state, { category: "slice", sliceId: "s2" });
    const reloaded = JSON.parse(JSON.stringify(state)) as EngineState;
    expect(reloaded.nextPick).toBe(3);
    expect(reloaded.picks.map((pick) => pick.pickNumber)).toEqual([1, 2]);
    expect(reloaded.players.find((player) => player.id === "p1")?.factionIds).toEqual(["f1"]);
    expect(reloaded.players.find((player) => player.id === "p2")?.sliceId).toBe("s2");
  });

  it("lets only the host reveal, then keeps the same assignments", () => {
    let state = makeState();
    while (state.status === "active") {
      const player = state.players.find((entry) => entry.draftOrder === snakeDraftOrder(state.nextPick))!;
      const factionCount = state.picks.filter((pick) => pick.playerId === player.id && pick.category === "faction").length;
      const takenFactions = new Set(state.picks.map((pick) => pick.factionId));
      const choice: PickChoice =
        factionCount < 2
          ? { category: "faction", factionId: state.factionIds.find((id) => !takenFactions.has(id))! }
          : state.picks.some((pick) => pick.playerId === player.id && pick.category === "slice")
            ? {
                category: "position",
                position: [1, 2, 3, 4, 5, 6].find((position) => !state.picks.some((pick) => pick.position === position))!,
              }
            : { category: "slice", sliceId: state.sliceIds.find((id) => !state.picks.some((pick) => pick.sliceId === id))! };
      state = applyPick(state, player.userId!, choice);
    }

    expect(() => revealDraft(state, "user-1", () => 0.1)).toThrow(/only the host/i);

    const flips = [0.1, 0.9, 0.1, 0.9, 0.1, 0.9];
    let index = 0;
    const revealed = revealDraft(state, "host", () => flips[index++] ?? 0);
    expect(revealed.status).toBe("revealed");
    const ordered = [...revealed.players].sort((a, b) => a.draftOrder - b.draftOrder);
    ordered.forEach((player, playerIndex) => {
      const factions = revealed.picks
        .filter((pick) => pick.playerId === player.id && pick.category === "faction")
        .sort((a, b) => a.pickNumber - b.pickNumber)
        .map((pick) => pick.factionId);
      expect(player.mainFactionId).toBe(flips[playerIndex]! < 0.5 ? factions[0] : factions[1]);
      expect(player.minorFactionId).toBe(flips[playerIndex]! < 0.5 ? factions[1] : factions[0]);
      expect(player.position).toBeGreaterThan(0);
      expect(oppositePosition(player.position!)).not.toBe(player.position);
    });

    const reloaded = JSON.parse(JSON.stringify(revealed)) as EngineState;
    const again = revealDraft(reloaded, "host", () => {
      throw new Error("reroll");
    });
    expect(again.players.map((player) => [player.mainFactionId, player.minorFactionId])).toEqual(
      reloaded.players.map((player) => [player.mainFactionId, player.minorFactionId]),
    );
  });
});

describe("opposite positions", () => {
  it("pairs 1-4, 2-5, and 3-6", () => {
    expect(oppositePosition(1)).toBe(4);
    expect(oppositePosition(4)).toBe(1);
    expect(oppositePosition(2)).toBe(5);
    expect(oppositePosition(5)).toBe(2);
    expect(oppositePosition(3)).toBe(6);
    expect(oppositePosition(6)).toBe(3);
  });
});
