export type HexSeat = {
  position: number;
  title: string;
  subtitle?: string;
  note?: string;
  taken?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

const layout: Record<number, string> = {
  1: "left-1/2 top-0 -translate-x-1/2",
  2: "right-0 top-[22%]",
  3: "right-0 bottom-[22%]",
  4: "left-1/2 bottom-0 -translate-x-1/2",
  5: "left-0 bottom-[22%]",
  6: "left-0 top-[22%]",
};

export function HexTable({ seats }: { seats: HexSeat[] }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute left-1/2 top-1/2 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 bg-[#243056] shadow-[0_0_40px_rgba(139,124,255,0.25)] [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]" />
      <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e4c27a]">
        Galaxy
      </p>
      {seats.map((seat) => {
        const className = `absolute w-[30%] max-w-28 rounded-2xl border px-2 py-2 text-left shadow-lg ${layout[seat.position]} ${
          seat.selected
            ? "border-[#e4c27a] bg-[#e4c27a] text-[#1a1204]"
            : seat.taken
              ? "border-white/10 bg-[#12182a]/90 text-white/45"
              : "border-[#8b7cff]/40 bg-[#171e36] text-[#e8eefc]"
        }`;
        const body = (
          <>
            <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">Pos {seat.position}</span>
            <span className="block truncate text-sm font-semibold">{seat.title}</span>
            {seat.subtitle ? <span className="block truncate text-[11px] opacity-80">{seat.subtitle}</span> : null}
            {seat.note ? <span className="block truncate text-[11px] opacity-70">{seat.note}</span> : null}
          </>
        );
        if (!seat.onSelect) {
          return (
            <div key={seat.position} className={className}>
              {body}
            </div>
          );
        }
        return (
          <button key={seat.position} type="button" className={`${className} min-h-16 disabled:cursor-not-allowed`} disabled={seat.disabled} onClick={seat.onSelect}>
            {body}
          </button>
        );
      })}
    </div>
  );
}
