import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">{children}</div>;
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <Shell>
      <div className="grid min-h-[50vh] place-items-center">
        <p className="font-display text-xl tracking-wide text-[#e4c27a]">{label}</p>
      </div>
    </Shell>
  );
}

export function Notice({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  const toneClass =
    tone === "error"
      ? "border-[#ff8b8b]/40 bg-[#ff8b8b]/10 text-[#ffd5d5]"
      : "border-[#8b7cff]/40 bg-[#8b7cff]/10 text-[#e4e0ff]";
  return <p className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClass}`}>{children}</p>;
}

const buttonStyles = {
  primary: "bg-[#e4c27a] text-[#1a1204] hover:bg-[#f3dfb0]",
  ghost: "border border-white/15 bg-white/5 text-[#e8eefc] hover:bg-white/10",
  danger: "border border-[#ff8b8b]/40 bg-transparent text-[#ffc4c4] hover:bg-[#ff8b8b]/10",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
    />
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/15 bg-[#070b14] px-3 py-3 text-base text-[#e8eefc] outline-none placeholder:text-white/30 focus:border-[#e4c27a] ${props.className ?? ""}`}
    />
  );
}

export function Header({
  code,
  detail,
  connection,
}: {
  code?: string;
  detail?: string;
  connection?: "live" | "reconnecting" | "offline";
}) {
  const connectionLabel =
    connection === "live" ? "Live" : connection === "offline" ? "Offline" : connection ? "Reconnecting" : null;
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <Link href="/" className="font-display text-lg tracking-[0.18em] text-[#e4c27a]">
          TI4 DRAFT
        </Link>
        {code ? <p className="mt-1 text-sm text-white/70">Table {code}</p> : null}
        {detail ? <p className="text-sm text-white/80">{detail}</p> : null}
      </div>
      {connectionLabel ? (
        <p
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            connection === "live" ? "border-[#7dcea0]/40 text-[#9ee0b8]" : "border-white/15 text-white/70"
          }`}
        >
          {connectionLabel}
        </p>
      ) : null}
    </header>
  );
}
