"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

/**
 * Imole ("light" in Yoruba): OIC Solar's dashboard mascot.
 * A battery-bodied helper with a solar-panel hat and a little sun on its antenna.
 * Pure SVG + CSS (see app/imole.css). No images, no animation libraries.
 */

import { IMOLE_MOODS, type ImoleMood } from "./moods";

export { IMOLE_MOODS };
export type { ImoleMood };

export interface ImoleProps {
  mood?: ImoleMood;
  /** Rendered width in pixels; height follows the 200:230 artwork ratio. */
  size?: number;
  /** Eyes follow the pointer anywhere on the page. */
  trackPointer?: boolean;
  className?: string;
  /** Accessible label; defaults to "Imole, <mood>". */
  label?: string;
}

interface Look {
  x: number;
  y: number;
}

const CENTER: Look = { x: 0, y: 0 };
const CELLS = [0, 1, 2, 3] as const;
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/** Where the eyes point, given the pointer offset from the face (pixels). */
export function lookAt(dx: number, dy: number): Look {
  const dist = Math.hypot(dx, dy);
  if (!dist) return CENTER;
  const reach = Math.min(1, dist / 320);
  return { x: +((dx / dist) * 4 * reach).toFixed(2), y: +((dy / dist) * 3 * reach).toFixed(2) };
}

export default function Imole({ mood = "idle", size = 96, trackPointer = true, className = "", label }: ImoleProps) {
  const uid = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState<Look>(CENTER);
  const follows = trackPointer && mood !== "sleep" && mood !== "thinking";

  useEffect(() => {
    if (!follows) {
      setLook(CENTER);
      return;
    }
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setLook(lookAt(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height * 0.55)));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [follows]);

  const eyes = mood === "thinking" ? { x: 3, y: -3 } : look;
  const style = { "--im-lx": `${eyes.x}px`, "--im-ly": `${eyes.y}px`, width: size, height: (size * 230) / 200 } as CSSProperties;
  const fill = (name: string) => `url(#${uid}-${name})`;
  const { charge } = IMOLE_MOODS[mood];

  return (
    <span className={`imole imole--${mood} ${className}`} style={style}>
      <svg ref={ref} viewBox="0 0 200 230" fill="none" role="img" aria-label={label ?? `Imole, ${IMOLE_MOODS[mood].label}`}>
        <defs>
          <linearGradient id={`${uid}-body`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop stopColor="#ffd56b" />
            <stop offset="0.45" stopColor="#f6a21a" />
            <stop offset="1" stopColor="#e9730f" />
          </linearGradient>
          <linearGradient id={`${uid}-panel`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#33427a" />
            <stop offset="1" stopColor="#141b36" />
          </linearGradient>
          <linearGradient id={`${uid}-screen`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#1d2340" />
            <stop offset="1" stopColor="#0d1122" />
          </linearGradient>
          <radialGradient id={`${uid}-sun`} cx="0.4" cy="0.35" r="0.7">
            <stop stopColor="#fff6cf" />
            <stop offset="0.55" stopColor="#ffc53d" />
            <stop offset="1" stopColor="#f39200" />
          </radialGradient>
          <radialGradient id={`${uid}-shadow`}>
            <stop stopColor="#0b0d16" stopOpacity="0.28" />
            <stop offset="1" stopColor="#0b0d16" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-ring`}>
            <stop offset="0.6" stopColor="#ffb020" stopOpacity="0" />
            <stop offset="1" stopColor="#ffb020" stopOpacity="0.35" />
          </radialGradient>
          <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        <ellipse className="im-shadow" cx="100" cy="219" rx="46" ry="7" fill={fill("shadow")} />
        <circle className="im-ring" cx="100" cy="128" r="96" fill={fill("ring")} />

        {/* Mood extras */}
        <g className="im-sparkles" fill="#ffc53d">
          <path d="M28 66l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          <path d="M174 52l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M182 128l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
        </g>
        <g className="im-zzz" fill="#8b93b8" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700">
          <text x="146" y="58" fontSize="12">z</text>
          <text x="158" y="44" fontSize="16">z</text>
          <text x="172" y="27" fontSize="21">z</text>
        </g>
        <g className="im-dots" fill="#ffb020">
          <circle cx="150" cy="46" r="4" />
          <circle cx="163" cy="34" r="5.5" />
          <circle cx="179" cy="20" r="7" />
        </g>
        <g className="im-alert">
          <circle cx="166" cy="40" r="14" fill="#dc3b30" />
          <path d="M166 32v10" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="166" cy="47.5" r="2" fill="#fff" />
        </g>

        <g className="im-float">
          {/* Antenna with its little sun */}
          <path d="M100 66V30" stroke="#2a3354" strokeWidth="3.5" strokeLinecap="round" />
          <g className="im-rays" stroke="#ffb020" strokeWidth="2.6" strokeLinecap="round">
            {RAYS.map((a) => (
              <path key={a} d="M100 6.5V2.5" transform={`rotate(${a} 100 18)`} />
            ))}
          </g>
          <circle className="im-sun" cx="100" cy="18" r="8.5" fill={fill("sun")} />

          {/* Arms */}
          <g className="im-arm im-arm-l">
            <rect x="22" y="130" width="19" height="42" rx="9.5" fill="#e27a10" />
            <circle cx="31.5" cy="170" r="9" fill="#2a3354" />
          </g>
          <g className="im-arm im-arm-r">
            <rect x="159" y="130" width="19" height="42" rx="9.5" fill="#e27a10" />
            <circle cx="168.5" cy="170" r="9" fill="#2a3354" />
          </g>

          {/* Feet */}
          <rect x="62" y="194" width="28" height="15" rx="7.5" fill="#2a3354" />
          <rect x="110" y="194" width="28" height="15" rx="7.5" fill="#2a3354" />

          {/* Battery body */}
          <rect x="40" y="84" width="120" height="116" rx="30" fill={fill("body")} />
          <path d="M58 100c6-8 15-12 26-12" stroke="#fff3c9" strokeOpacity="0.8" strokeWidth="4" strokeLinecap="round" />
          <rect x="160" y="128" width="6" height="18" rx="2" fill="#2a3354" />

          {/* Solar-panel hat */}
          <g className="im-panel">
            <path d="M42 62h116l17 29H25z" fill={fill("panel")} stroke="#ffd27a" strokeWidth="2" strokeLinejoin="round" />
            <path d="M71 62l-8 29M100 62v29M129 62l8 29M33 77h134" stroke="#7d8fd1" strokeOpacity="0.55" strokeWidth="1.2" />
            <path d="M52 66h22l-4 8H48z" fill="#ffffff" opacity="0.16" />
          </g>

          {/* Face screen */}
          <rect x="55" y="104" width="90" height="60" rx="19" fill={fill("screen")} stroke="#ffd27a" strokeOpacity="0.45" strokeWidth="1.5" />
          <g className="im-look">
            <g className="im-eyes-open">
              <rect x="75" y="119" width="14" height="21" rx="7" fill="#ffd166" opacity="0.6" filter={fill("glow")} />
              <rect x="111" y="119" width="14" height="21" rx="7" fill="#ffd166" opacity="0.6" filter={fill("glow")} />
              <rect x="75" y="119" width="14" height="21" rx="7" fill="#ffd166" />
              <rect x="111" y="119" width="14" height="21" rx="7" fill="#ffd166" />
              <circle cx="79.5" cy="124" r="2.2" fill="#fffbea" />
              <circle cx="115.5" cy="124" r="2.2" fill="#fffbea" />
            </g>
            <g className="im-eyes-happy" stroke="#ffd166" strokeWidth="4.2" strokeLinecap="round">
              <path d="M74 134q8-13 16 0" />
              <path d="M110 134q8-13 16 0" />
            </g>
            <g className="im-eyes-closed" stroke="#ffd166" strokeOpacity="0.8" strokeWidth="3.2" strokeLinecap="round">
              <path d="M74 131q8 6 16 0" />
              <path d="M110 131q8 6 16 0" />
            </g>
            <path className="im-mouth" d="M92 150q8 6.5 16 0" stroke="#ffd166" strokeWidth="3" strokeLinecap="round" />
            <ellipse className="im-mouth-talk" cx="100" cy="151" rx="6.5" ry="4.5" fill="#ffd166" />
            <path className="im-mouth-o" d="M96 151a4 4 0 1 0 8 0a4 4 0 1 0-8 0" stroke="#ffd166" strokeWidth="2.6" />
          </g>
          <circle cx="66" cy="149" r="5" fill="#ff8a5b" opacity="0.4" />
          <circle cx="134" cy="149" r="5" fill="#ff8a5b" opacity="0.4" />

          {/* Charge meter: how "full of energy" Imole is in this mood */}
          <rect x="73" y="172" width="54" height="17" rx="5.5" fill="#141a33" opacity="0.9" />
          <rect x="127" y="177" width="3.5" height="7" rx="1.2" fill="#141a33" opacity="0.9" />
          {CELLS.map((i) => (
            <rect key={i} className={`im-cell ${i < charge ? "on" : ""}`} x={77 + i * 12.2} y="176" width="9.5" height="9" rx="2" />
          ))}
        </g>
      </svg>
    </span>
  );
}
