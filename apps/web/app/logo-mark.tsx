type LogoMarkProps = {
  /** Size of the rounded tile in px. */
  size?: number;
  className?: string;
};

/**
 * Hackathon Atlas mark — a blueprint coordinate/crosshair enclosed in the
 * near-black tile. Reads as a point plotted on a map (a hackathon located on
 * the atlas) and echoes the site's "+" corner-mark / blueprint language.
 */
export function LogoMark({ size = 26, className }: LogoMarkProps) {
  const radius = Math.round(size * 0.27);
  const glyph = Math.round(size * 0.62);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: radius,
        background: "#0A0A0A",
        flexShrink: 0,
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="5.5" stroke="#fff" strokeWidth="1.6" />
        <path
          d="M12 2v4M12 18v4M2 12h4M18 12h4"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="1.7" fill="#fff" />
      </svg>
    </span>
  );
}
