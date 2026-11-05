import { oppositePosition } from "@/lib/draft-rules";
import { homeTileForFaction } from "@/lib/tiles";

export type HomeFace = {
  role: "main" | "minor";
  title: string;
  subtitle: string;
  factionName: string | null;
  tileId: string | null;
};

export type SliceHomes = {
  main: HomeFace;
  minor: HomeFace;
};

function face(role: "main" | "minor", title: string, subtitle: string, factionName: string | null): HomeFace {
  const tile = factionName ? homeTileForFaction(factionName) : null;
  return {
    role,
    title,
    subtitle,
    factionName,
    tileId: tile?.id ?? null,
  };
}

export function reservedHomes(): SliceHomes {
  return {
    main: face("main", "HOME SYSTEM", "", null),
    minor: face("minor", "MINOR HOME", "", null),
  };
}

export function awaitingHomes(): SliceHomes {
  return {
    main: face("main", "HOME SYSTEM", "Awaiting reveal", null),
    minor: face("minor", "MINOR HOME", "Awaiting reveal", null),
  };
}

export function assignedHomes(mainFaction: string | null, oppositeMinorFaction: string | null): SliceHomes {
  const mainName = mainFaction?.trim() || null;
  const minorName = oppositeMinorFaction?.trim() || null;
  return {
    main: face("main", mainName ?? "HOME SYSTEM", "Main home", mainName),
    minor: face("minor", minorName ?? "MINOR HOME", "Minor home", minorName),
  };
}

export function homesForSeat(input: {
  revealed: boolean;
  position: number | null;
  mainFaction: string | null;
  oppositeMinorFaction: string | null;
}): SliceHomes {
  if (!input.revealed || !input.position) return awaitingHomes();
  return assignedHomes(input.mainFaction, input.oppositeMinorFaction);
}

export function minorFactionAcrossFrom(
  position: number,
  seats: readonly { position: number; minorFaction: string | null }[],
): string | null {
  const opposite = oppositePosition(position);
  return seats.find((seat) => seat.position === opposite)?.minorFaction ?? null;
}
