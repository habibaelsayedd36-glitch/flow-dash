/**
 * Original FLOW Agency logo assets served by the official website.
 * Keep the mark and wordmark as image assets rather than recreating the logo.
 */
const MARK = "https://www.flow-agency-eg.com/assets/logos/Symbol.png";
const WORDMARK = "https://www.flow-agency-eg.com/assets/flow-wordmark-white.png";

export function Brand({ tone = "green", product = "Flow" }: { tone?: "green" | "white"; product?: "Flow" | "Space" }) {
  const greenFilter = "brightness(0) saturate(100%) invert(19%) sepia(22%) saturate(1184%) hue-rotate(91deg) brightness(93%) contrast(91%)";
  return (
    <span className="flex items-center gap-3">
      <img src={MARK} alt="" width={36} height={36} className="size-9 object-contain" />
      <img
        src={WORDMARK}
        alt="FLOW"
        width={60}
        height={24}
        className="h-6 w-[60px] object-contain"
        style={tone === "green" ? { filter: greenFilter } : undefined}
      />
      <span className="rounded-full bg-flow-lime px-3 py-1 font-display text-sm font-bold leading-5 text-flow-green">{product}</span>
    </span>
  );
}

/** Lime grid on flow-green: the pattern behind the dashboard's sign-in panel. */
const SQUARES: [number, number][] = [
  [1, 1], [6, 0], [13, 0], [2, 3], [4, 5], [10, 6], [12, 5], [16, 7], [15, 9], [9, 2],
  [6, 13], [7, 13], [9, 13], [7, 14], [13, 14], [1, 17], [2, 17], [12, 17], [14, 17], [20, 3], [24, 6], [22, 10], [27, 2], [19, 12],
];

export function GridPattern({ id }: { id: string }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full fill-flow-lime/15 stroke-flow-lime/20 [mask-image:radial-gradient(ellipse_at_40%_45%,white,transparent_95%)]"
    >
      <defs>
        <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse" x="-1" y="-1">
          <path d="M.5 40V.5H40" fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth="0" fill={`url(#${id})`} />
      <svg x="-1" y="-1" className="overflow-visible">
        {SQUARES.map(([x, y]) => (
          <rect key={`${x}-${y}`} strokeWidth="0" width="39" height="39" x={x * 40 + 1} y={y * 40 + 1} />
        ))}
      </svg>
    </svg>
  );
}
