import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type ActionVariant = 'primary' | 'secondary' | 'danger';

type AnchorOnlyProps = Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'download' | 'rel' | 'target'>;

type ActionButtonProps = {
  children: ReactNode;
  variant?: ActionVariant;
  className?: string;
  href?: string;
} & AnchorOnlyProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>;

export function ActionButton({ children, variant = 'primary', className, href, download, rel, target, ...buttonProps }: ActionButtonProps) {
  const classes = ['action-button', className].filter(Boolean).join(' ');

  if (href) {
    return (
      <a href={href} download={download} rel={rel} target={target} className={classes} data-variant={variant}>
        {children}
      </a>
    );
  }

  return (
    <button {...buttonProps} className={classes} data-variant={variant}>
      {children}
    </button>
  );
}
