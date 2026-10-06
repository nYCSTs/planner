"use client";

import { useMemo } from "react";
import { encode } from "uqr";

/** QR as an SVG of dark modules on a white quiet zone (scanners need contrast). */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const path = useMemo(() => {
    const { data } = encode(value, { ecc: "M", border: 2 });
    let d = "";
    data.forEach((row, y) => {
      row.forEach((on, x) => {
        if (on) {
          d += `M${x} ${y}h1v1h-1z`;
        }
      });
    });
    return { d, n: data.length };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${path.n} ${path.n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg bg-white"
      role="img"
      aria-label="QR code de pareamento"
    >
      <path d={path.d} fill="#000" />
    </svg>
  );
}
