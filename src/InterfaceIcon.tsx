import type { SVGProps } from "react";
type Name =
  | "inspirations"
  | "uploads"
  | "text"
  | "background"
  | "shapes"
  | "dieline"
  | "image"
  | "cloud"
  | "rotate";
/** Independent SVG drawings of standard editor symbols; no vendor icon font. */
export function InterfaceIcon({
  name,
  size = 24,
  active = false,
  ...props
}: SVGProps<SVGSVGElement> & { name: Name; size?: number; active?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {name === "inspirations" && (
        <>
          <ellipse
            cx="12"
            cy="12"
            rx="5"
            ry="11"
            transform="rotate(45 12 12)"
            fill={active ? "currentColor" : "none"}
          />
          <ellipse
            cx="12"
            cy="12"
            rx="5"
            ry="11"
            transform="rotate(-45 12 12)"
            fill={active ? "currentColor" : "none"}
          />
          {active && (
            <circle cx="12" cy="12" r="3" fill="white" stroke="white" />
          )}
        </>
      )}
      {name === "uploads" && (
        <>
          <path
            d="M6 18H5a4 4 0 0 1-.5-7.97A7.5 7.5 0 0 1 19 9a4.5 4.5 0 0 1 0 9h-1"
            fill={active ? "currentColor" : "none"}
          />
          <path
            d="M12 21V10m-4 4 4-4 4 4"
            stroke={active ? "white" : "currentColor"}
          />
        </>
      )}
      {name === "text" && (
        <>
          <path d="M4 3h16v18H4z" fill={active ? "currentColor" : "none"} />
          <path
            d="M8 8V7h8v1m-4-1v10m-2 0h4"
            stroke={active ? "white" : "currentColor"}
          />
        </>
      )}
      {name === "background" && (
        <>
          <path
            d="M12 2a10 10 0 1 0 0 20h1a2.5 2.5 0 0 0 1.8-4.2 1.5 1.5 0 0 1 1.1-2.6H18a4 4 0 0 0 4-4C22 6 17 2 12 2Z"
            fill={active ? "currentColor" : "none"}
          />
          {[
            [7, 8],
            [12, 6],
            [17, 8],
            [6, 13],
          ].map(([x, y]) => (
            <circle
              key={x}
              cx={x}
              cy={y}
              r=".9"
              fill={active ? "white" : "currentColor"}
              stroke="none"
            />
          ))}
        </>
      )}
      {name === "shapes" && (
        <>
          <circle cx="9" cy="9" r="6" fill={active ? "currentColor" : "none"} />
          <path d="M9 9h12v12H9z" fill={active ? "currentColor" : "white"} />
        </>
      )}
      {name === "dieline" && (
        <>
          <path d="M8 6V3h8v3h5v12h-5v3H8v-3H3V6h5Z" />
          <path d="M8 6h8v12H8Z" strokeDasharray="2 2" />
          <path d="M19 3h4m-2-2v4" />
        </>
      )}
      {name === "image" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <path d="m3 17 6-6 4 4 4-4 4 4m-4-6h.01" />
        </>
      )}
      {name === "cloud" && (
        <>
          <path d="M6 19a5 5 0 0 1-1-9.9 7 7 0 0 1 13-1.6A6 6 0 0 1 18 19Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "rotate" && (
        <>
          <path d="M5 5a9 9 0 1 1-2 8m0 0v-4m0 4h4" />
          <text
            x="8"
            y="15"
            fill="currentColor"
            stroke="none"
            fontSize="9"
            fontFamily="Arial"
          >
            90
          </text>
        </>
      )}
    </svg>
  );
}
