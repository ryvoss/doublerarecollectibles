import type { MouseEvent, ReactNode } from "react";

type PublicLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
  onNavigate: (path: string) => void;
  current?: boolean;
};

export function PublicLink({ children, className, href, onNavigate, current }: PublicLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onNavigate(href);
  }

  return (
    <a className={className} href={href} onClick={handleClick} aria-current={current ? "page" : undefined}>
      {children}
    </a>
  );
}

