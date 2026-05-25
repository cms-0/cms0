export function Logo({
  className,
  uniColor = true,
}: Readonly<{
  className?: string;
  uniColor?: boolean;
}>) {
  const fill = uniColor ? "currentColor" : "url(#cms0-mark-gradient)";
  const stroke = uniColor ? "currentColor" : "url(#cms0-mark-gradient)";

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke={stroke}
        strokeWidth="1.4"
      />
      <rect
        x="6"
        y="7"
        width="7"
        height="6"
        rx="2"
        fill={fill}
        fillOpacity="0.7"
      />
      <rect
        x="11"
        y="11"
        width="7"
        height="6"
        rx="2"
        fill={fill}
        fillOpacity="0.45"
      />
      <circle cx="16.5" cy="7.5" r="1.5" fill={fill} />
      <defs>
        <linearGradient
          id="cms0-mark-gradient"
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#22D3EE" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
    </svg>
  );
}
