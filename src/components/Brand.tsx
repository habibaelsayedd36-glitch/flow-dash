/**
 * Official full FLOW Agency lockup from the website footer.
 * Keep the original artwork unchanged.
 */
const LOGO = "https://www.flow-agency-eg.com/assets/logo/flow-lockup-white.png";

export function Brand(_props: { tone?: "green" | "white"; product?: "Flow" | "Space" }) {
  return (
    <img
      src={LOGO}
      alt="FLOW Agency"
      className="h-10 w-auto max-w-[180px] object-contain object-left"
    />
  );
}

/** Decorative background pattern used by the dashboard sign-in panel. */
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
