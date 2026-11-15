import Image from "next/image";

/**
 * The Flow brand row exactly as the live dashboards use it: mark, wordmark and
 * a lime product pill ("Flow" for the team dashboard, "Space" for the client
 * portal). Assets are the originals from /assets/logo on flow-agency-eg.com.
 */
export function Brand({ tone = "green", product = "Flow" }: { tone?: "green" | "white"; product?: "Flow" | "Space" }) {
  return (
    <span className="flex items-center gap-3">
      <Image src={`/brand/flow-mark-${tone}.png`} alt="" width={36} height={36} priority className="size-9" />
      <Image src={`/brand/flow-wordmark-${tone}.png`} alt="FLOW" width={60} height={24} priority className="h-6 w-[60px]" />
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
