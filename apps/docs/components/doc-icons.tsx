import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function StartIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconFrame>
  );
}

export function HostedIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 7h16" />
      <path d="M7 7v12" />
      <path d="M17 7v12" />
      <path d="M5 19h14" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
    </IconFrame>
  );
}

export function SelfHostingIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M6 6h12v5H6z" />
      <path d="M6 13h12v5H6z" />
      <path d="M9 8.5h.01" />
      <path d="M9 15.5h.01" />
      <path d="M12 8.5h3" />
      <path d="M12 15.5h3" />
    </IconFrame>
  );
}

export function AppIntegrationIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m8 9-3 3 3 3" />
      <path d="m16 9 3 3-3 3" />
      <path d="m14 5-4 14" />
    </IconFrame>
  );
}

export function ContentIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M14 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconFrame>
  );
}

export function ReferenceIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 5h14v14H5z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
      <path d="M9 17h3" />
    </IconFrame>
  );
}
