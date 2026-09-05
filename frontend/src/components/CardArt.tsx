import type { ComponentType } from "react";

/**
 * Decorative background for a Card: a tinted gradient, a glowing wave along the bottom, a large
 * faded icon on the right and (for cards) a text wordmark for the network. Purely visual —
 * absolutely positioned, no pointer events. Place it as the first child of a `relative
 * overflow-hidden` Card and give the real content `relative z-10`.
 *
 * Theme-aware: the tint is mixed into the card colour, so it stays soft in light mode and rich in
 * dark mode. No brand image assets are used; network marks are typographic.
 */
export default function CardArt({
  color,
  icon: Icon,
  network,
  subtle = false,
  wave = true,
  markTop = "58%",
  markOpacity = 1,
}: {
  color: string;
  icon?: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  network?: string | null;
  /** Gradient + glow only (for chart cards and dense tiles) — no wave, no mark. */
  subtle?: boolean;
  /** Set false on wide cards where the wave would run behind body text (the mark still shows). */
  wave?: boolean;
  /**
   * Where the network mark sits vertically. Cards differ in how tall they are and where their
   * right-aligned values fall, so the caller picks the band that is actually free.
   */
  markTop?: string;
  /**
   * Multiplies the mark's own opacity. Dense cards whose every row carries a right-aligned value
   * have no free band, so there the mark has to read as texture rather than as text.
   */
  markOpacity?: number;
}) {
  const key = (network ?? "").toUpperCase();
  const hasMark = key === "MASTERCARD" || key === "VISA" || key === "AMEX" || key === "RUPAY";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${color} 26%, var(--card)) 0%, color-mix(in oklab, ${color} 8%, var(--card)) 60%, var(--card) 100%)`,
      }}
    >
      {/* soft glow top-right */}
      <div
        className="absolute -top-10 -right-10 size-44 rounded-full"
        style={{ background: `radial-gradient(circle, ${color}33 0%, transparent 70%)` }}
      />
      {subtle ? null : (
      <>
      {/* wave */}
      {wave && (
      <svg className="absolute inset-x-0 bottom-0 h-24 w-full" viewBox="0 0 400 100" preserveAspectRatio="none">
        <path
          d="M0 70 C 90 30, 150 110, 250 65 S 360 45, 400 30"
          fill="none"
          stroke={color}
          strokeOpacity="0.4"
          strokeWidth="2"
        />
        <path
          d="M0 70 C 90 30, 150 110, 250 65 S 360 45, 400 30"
          fill="none"
          stroke={color}
          strokeOpacity="0.12"
          strokeWidth="12"
        />
        <path
          d="M0 82 C 110 50, 170 120, 270 78 S 370 60, 400 48"
          fill="none"
          stroke={color}
          strokeOpacity="0.2"
          strokeWidth="1.5"
        />
      </svg>
      )}
      {/* network wordmark or big icon */}
      {/* kept translucent: the card's right-aligned values render on top of it */}
      <div
        className="absolute right-4 -translate-y-1/2 select-none"
        style={{ color, top: hasMark ? markTop : "58%", opacity: markOpacity }}
      >
        {key === "MASTERCARD" ? (
          <div className="flex items-center opacity-45">
            <span className="size-10 rounded-full bg-[#eb001b]" />
            <span className="-ml-4 size-10 rounded-full bg-[#f79e1b]" />
          </div>
        ) : key === "VISA" ? (
          <span className="text-3xl font-black tracking-tight italic opacity-40">VISA</span>
        ) : key === "AMEX" ? (
          <span className="block max-w-[7rem] text-right text-[11px] leading-tight font-black tracking-wider uppercase opacity-45">
            American Express
          </span>
        ) : key === "RUPAY" ? (
          <span className="text-2xl font-black italic opacity-45">
            Ru<span className="text-emerald-500">Pay</span>
            <span className="ml-0.5 inline-block size-2 rotate-45 bg-orange-500" />
          </span>
        ) : Icon ? (
          <Icon className="size-20 opacity-20" />
        ) : null}
      </div>
      </>
      )}
    </div>
  );
}

/** Tint colour for a card network (mirrors the mobile app). */
export function networkColor(network: string | null | undefined, fallback: string): string {
  switch ((network ?? "").toUpperCase()) {
    case "AMEX":
      return "#3b82f6";
    case "MASTERCARD":
      return "#f97316";
    case "VISA":
      return "#f5c542";
    case "RUPAY":
      return "#8b5cf6";
    default:
      return fallback;
  }
}
