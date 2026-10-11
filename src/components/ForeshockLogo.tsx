import React, { useId } from 'react';

interface ForeshockLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  withContainer?: boolean;
}

export const ForeshockLogo: React.FC<ForeshockLogoProps> = ({
  className = 'w-8 h-8',
  size,
  showText = false,
  withContainer = false,
}) => {
  const rawId = useId();
  // Sanitize id for valid SVG identifiers
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const gradPrimaryId = `fs-grad-pri-${uid}`;
  const gradSecondaryId = `fs-grad-sec-${uid}`;
  const gradAccentId = `fs-grad-acc-${uid}`;
  const gradBorderId = `fs-grad-border-${uid}`;

  const dimensionProps = size ? { width: size, height: size } : {};

  const glyph = (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={size ? undefined : className}
      aria-label="Foreshock Logo"
      role="img"
      {...dimensionProps}
    >
      <defs>
        {/* Primary seismic shockwave gradient (electric orange to fiery red) */}
        <linearGradient id={gradPrimaryId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFA100" />
          <stop offset="40%" stopColor="#FF5E00" />
          <stop offset="100%" stopColor="#E61E00" />
        </linearGradient>

        {/* Secondary pulse gradient (bright amber-gold to deep orange) */}
        <linearGradient id={gradSecondaryId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFC107" />
          <stop offset="60%" stopColor="#FF6D00" />
          <stop offset="100%" stopColor="#DD2C00" />
        </linearGradient>

        {/* Accent highlight gradient */}
        <linearGradient id={gradAccentId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="100%" stopColor="#FF9100" />
        </linearGradient>

        {/* Subtle container border gradient */}
        <linearGradient id={gradBorderId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="50%" stopColor="#FF6D00" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
      </defs>

      {withContainer && (
        <>
          <rect width="100" height="100" rx="22" fill="#090E17" />
          <rect
            x="0.75"
            y="0.75"
            width="98.5"
            height="98.5"
            rx="21.25"
            fill="none"
            stroke={`url(#${gradBorderId})`}
            strokeWidth="1.5"
          />
        </>
      )}

      {/* Main Stylized Seismic 'F' Monogram */}
      <g>
        {/* Slanted Primary Backbone Stem */}
        <path
          d="M26 18 L39 18 L29 82 L16 82 Z"
          fill={`url(#${gradPrimaryId})`}
        />

        {/* Top Forward-Thrusting Shockwave Wing */}
        <path
          d="M38 18 L85 18 L73 35 L35 35 Z"
          fill={`url(#${gradPrimaryId})`}
        />

        {/* Dynamic Seismic Fracture Wedge (Top Accent) */}
        <polygon
          points="86,18 90,24 77,35 73,35"
          fill={`url(#${gradAccentId})`}
        />

        {/* Middle Pulse Shockwave Wing */}
        <path
          d="M33 46 L71 46 L60 61 L30 61 Z"
          fill={`url(#${gradSecondaryId})`}
        />

        {/* Mid Wavefront Wedge (Middle Accent) */}
        <polygon
          points="72,46 76,51 64,61 60,61"
          fill={`url(#${gradAccentId})`}
        />

        {/* Seismic Epicenter Pulse Point */}
        <circle cx="21.5" cy="77.5" r="3" fill="#FFC107" />
        <circle
          cx="21.5"
          cy="77.5"
          r="5.5"
          stroke="#FFA100"
          strokeWidth="1"
          strokeOpacity="0.5"
          fill="none"
        />
      </g>
    </svg>
  );

  if (withContainer) {
    return (
      <div className="inline-flex items-center gap-3">
        {glyph}
        {showText && (
          <span className="font-bold text-2xl tracking-tight text-[#0B2B33]">
            Foreshock
          </span>
        )}
      </div>
    );
  }

  if (showText) {
    return (
      <div className="inline-flex items-center gap-2.5">
        {glyph}
        <span className="font-bold text-2xl tracking-tight text-[#0B2B33]">
          Foreshock
        </span>
      </div>
    );
  }

  return glyph;
};

export default ForeshockLogo;
