import React from 'react';

export default function Card({
  children,
  className = '',
  title,
  subtitle,
  headerAction,
  footer,
  padding = 'p-6',
  ...props
}) {
  return (
    <div
      className={`bg-theme-card border border-theme-border rounded-xl transition-colors ${className}`}
      {...props}
    >
      {(title || subtitle || headerAction) && (
        <div className="px-6 py-4 border-b border-theme-border flex items-center justify-between gap-4">
          <div>
            {title && (
              <h3 className="font-semibold text-theme-text text-base leading-snug">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-theme-text-secondary mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className={padding}>{children}</div>
      {footer && (
        <div className="px-6 py-3.5 border-t border-theme-border bg-theme-surface bg-opacity-30 rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  );
}
