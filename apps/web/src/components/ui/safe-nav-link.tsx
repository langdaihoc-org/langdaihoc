import type { ReactNode, MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { isSafeHttpsUrl, isSafeInternalPath } from '@langdaihoc/shared';

type Props = {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/** Internal `/path` → React Router; http(s) → `<a>` tab mới; scheme khác → không render link. */
export function SafeNavLink({ to, className, children, onClick }: Props) {
  const href = to?.trim() ?? '';
  if (href && isSafeInternalPath(href)) {
    return (
      <Link to={href} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  if (href && isSafeHttpsUrl(href) && !href.startsWith('/')) {
    return (
      <a href={href} className={className} onClick={onClick} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }

  return <span className={className}>{children}</span>;
}
