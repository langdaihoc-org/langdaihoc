import type { ReactNode, MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { isSafeInternalPath } from '@langdaihoc/shared';

type Props = {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/** Internal `/path` → React Router; http(s) → thẻ `<a>` mới tab. */
export function SafeNavLink({ to, className, children, onClick }: Props) {
  if (isSafeInternalPath(to)) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <a href={to} className={className} onClick={onClick} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
