/** Inline strokes rather than an icon package: a handful of glyphs is not worth a dependency. */
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type Props = { size?: number };
const svg = (size = 18) => ({ ...base, width: size, height: size });

export const Home = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

export const Stack = ({ size }: Props) => (
  <svg {...svg(size)}>
    <rect x="3" y="4" width="18" height="6" rx="2" />
    <rect x="3" y="14" width="18" height="6" rx="2" />
  </svg>
);

export const Doc = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

export const Gear = ({ size }: Props) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.4 8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
  </svg>
);

export const Info = ({ size }: Props) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8h.01" />
  </svg>
);

export const Play = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />
  </svg>
);

export const Square = ({ size }: Props) => (
  <svg {...svg(size)}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
);

export const Globe = ({ size }: Props) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
  </svg>
);

export const External = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
  </svg>
);

export const Check = ({ size }: Props) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
  </svg>
);

export const Alert = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const Clock = ({ size }: Props) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Db = ({ size }: Props) => (
  <svg {...svg(size)}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </svg>
);

export const Chart = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const Brain = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8A3 3 0 0 0 7 18a3 3 0 0 0 5 1.5V4.5A3 3 0 0 0 9 4z" />
    <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8A3 3 0 0 1 17 18a3 3 0 0 1-5 1.5" />
  </svg>
);

export const Monitor = ({ size }: Props) => (
  <svg {...svg(size)}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M9 20.5h6M12 16.5v4" />
  </svg>
);

export const Shield = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M12 3 4.5 6v6c0 4.5 3.2 7.9 7.5 9 4.3-1.1 7.5-4.5 7.5-9V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);

export const Bell = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M13.7 20a2 2 0 0 1-3.4 0" />
  </svg>
);

export const Inbox = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M3 12h5l2 3h4l2-3h5" />
    <path d="M5.5 5h13l2.5 7v6a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-6z" />
  </svg>
);

export const Refresh = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M20 11a8 8 0 0 0-13.7-5.3L3 9" />
    <path d="M4 13a8 8 0 0 0 13.7 5.3L21 15" />
    <path d="M3 4v5h5M21 20v-5h-5" />
  </svg>
);

export const Arrow = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const Folder = ({ size }: Props) => (
  <svg {...svg(size)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

/** The glyph that best matches what a service actually does. */
export function serviceIcon(name: string) {
  if (name.includes("discovery")) return Globe;
  if (name.includes("auth")) return Shield;
  if (name.includes("expense")) return Db;
  if (name.includes("ai-orchestrator")) return Brain;
  if (name.includes("ingestion")) return Inbox;
  if (name.includes("finance")) return Chart;
  if (name.includes("notification")) return Bell;
  if (name.includes("gateway")) return Stack;
  if (name.includes("frontend")) return Monitor;
  return Stack;
}
