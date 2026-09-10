import { useId } from "react";

/**
 * The Jarvis mark: the assistant, arm around a rising chart. Inline rather than a file so it
 * needs no packaging step and no request from the packaged app.
 *
 * The robot's shell is near-white, so `tile` (the default) wraps it in the navy squircle the
 * app icons use. Pass `tile={false}` on an already-dark surface.
 */
export default function JarvisLogo({
  size = 40,
  tile = true,
  className,
}: {
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  // Gradient ids have to be unique per instance, or a second logo would reuse the first's.
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${uid}-${name}`;

  const glyph = (
    <>
      <defs>
        <linearGradient id={id("shell")} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#F1F6FC" />
          <stop offset="1" stopColor="#C7D6E8" />
        </linearGradient>
        <linearGradient id={id("visor")} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#16304F" />
          <stop offset="1" stopColor="#050D1B" />
        </linearGradient>
        <linearGradient id={id("arc")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2AA6F5" />
          <stop offset="0.45" stopColor="#2CC5C8" />
          <stop offset="1" stopColor="#34D98A" />
        </linearGradient>
        <linearGradient id={id("bar")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5AECAC" />
          <stop offset="1" stopColor="#12B26F" />
        </linearGradient>
        <radialGradient id={id("spark")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8FF0FF" />
          <stop offset="1" stopColor="#22C3F5" />
        </radialGradient>
        <linearGradient id={id("tile")} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#132B4C" />
          <stop offset="0.55" stopColor="#0B1B33" />
          <stop offset="1" stopColor="#060E1C" />
        </linearGradient>
      </defs>
      <g>
        <path
          d="M44 140 C38 194 70 224 118 224 C168 224 208 190 232 120"
          fill="none"
          stroke={`url(#${id("arc")})`}
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path d="M243 92 L239 129 L209 108 Z" fill="#34D98A" />
        <circle cx="55" cy="106" r="19" fill={`url(#${id("shell")})`} />
        <circle cx="55" cy="106" r="9.5" fill="#2FC9F2" />
        <circle cx="169" cy="106" r="19" fill={`url(#${id("shell")})`} />
        <circle cx="169" cy="106" r="9.5" fill="#2FC9F2" />
        <path d="M112 58 V34" stroke="#CFE4F5" strokeWidth="7" strokeLinecap="round" fill="none" />
        <circle cx="112" cy="24" r="11" fill={`url(#${id("spark")})`} />
        <path d="M78 216 C78 182 93 164 112 164 C131 164 146 182 146 216 Z" fill={`url(#${id("shell")})`} />
        <path d="M100 154 h24 v14 h-24 z" fill="#C7D6E8" />
        <rect x="56" y="50" width="112" height="108" rx="50" fill={`url(#${id("shell")})`} />
        <rect x="70" y="74" width="84" height="58" rx="27" fill={`url(#${id("visor")})`} />
        <path d="M84 98 q11 12 22 0" fill="none" stroke="#3ED8FF" strokeWidth="6.5" strokeLinecap="round" />
        <path d="M118 98 q11 12 22 0" fill="none" stroke="#3ED8FF" strokeWidth="6.5" strokeLinecap="round" />
        <rect x="168" y="180" width="21" height="42" rx="7" fill={`url(#${id("bar")})`} />
        <rect x="195" y="158" width="21" height="64" rx="7" fill={`url(#${id("bar")})`} />
        <rect x="222" y="134" width="21" height="88" rx="7" fill={`url(#${id("bar")})`} />
      </g>
    </>
  );

  if (!tile) {
    return (
      <svg width={size} height={size} viewBox="0 0 256 256" className={className} role="img" aria-label="Jarvis">
        {glyph}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="Jarvis">
      <rect width="512" height="512" rx="112" fill={`url(#${id("tile")})`} />
      <g transform="translate(18 47) scale(1.72)">{glyph}</g>
    </svg>
  );
}
