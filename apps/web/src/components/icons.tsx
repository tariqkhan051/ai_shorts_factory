import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, className, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={className ?? 'h-4 w-4 shrink-0'}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </Icon>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
    </Icon>
  );
}

export function IconBrand(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8M12 8v8" />
    </Icon>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 19c.8-3 3-4.5 5.5-4.5S13.7 16 14.5 19" />
      <path d="M14 14.5c1.4-.5 3-.3 4.5.8" />
    </Icon>
  );
}

export function IconShare(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
    </Icon>
  );
}

export function IconBook(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M12 4h6.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H12" />
    </Icon>
  );
}

export function IconClapper(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" />
      <path d="M3 9 7.5 4h9L21 9" />
      <path d="m8 4 2.5 5M13 4l2.5 5" />
    </Icon>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.5M17.5 16l1.6 1.5M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.5M17.5 8l1.6-1.5" />
    </Icon>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5" />
      <path d="M5 16.5h14" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconCredits(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M9.5 9.5c.7-1 1.9-1.5 2.5-1.5 1.4 0 2.5.8 2.5 2s-1.1 2-2.5 2h-1c-1.4 0-2.5.8-2.5 2s1.1 2 2.5 2c.7 0 1.7-.4 2.4-1.3" />
    </Icon>
  );
}

export function IconSpinner(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v3" />
      <path d="M12 17v3" opacity="0.35" />
      <path d="m18.4 7.6-2.1 2.1" opacity="0.7" />
      <path d="m7.7 16.3-2.1 2.1" opacity="0.25" />
      <path d="M20 12h-3" opacity="0.55" />
      <path d="M7 12H4" opacity="0.2" />
      <path d="m18.4 16.4-2.1-2.1" opacity="0.4" />
      <path d="m7.7 7.7-2.1-2.1" opacity="0.85" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12.5 10 17l9-10" />
    </Icon>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 16.5h.01" />
    </Icon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function IconStatusDot({
  tone = 'muted',
  className,
}: {
  tone?: 'success' | 'warning' | 'muted' | 'accent';
  className?: string;
}) {
  const fill =
    tone === 'success'
      ? 'bg-success'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'accent'
          ? 'bg-accent'
          : 'bg-muted';
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${fill} ${className ?? ''}`}
      aria-hidden
    />
  );
}

export function IconMark(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h5M8 13h8" />
    </Icon>
  );
}

export function IconLogIn(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 12H8" />
      <path d="m12 8 4 4-4 4" />
    </Icon>
  );
}

export function IconEmptyInbox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Z" />
      <path d="m4 8 2.5-4h11L20 8" />
      <path d="M9 13h6" />
    </Icon>
  );
}
