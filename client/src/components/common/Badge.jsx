import React from 'react';

export default function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  const variantStyles = {
    neutral: 'bg-theme-surface text-theme-text-secondary border border-theme-border',
    purple: 'bg-purple-950/20 text-purple-400 border border-purple-800/40 dark:bg-purple-950/40 dark:text-purple-300',
    info: 'bg-blue-950/20 text-blue-500 border border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-300',
    warning: 'bg-amber-950/20 text-amber-600 border border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300',
    success: 'bg-emerald-950/20 text-emerald-600 border border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-300',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md tracking-wide ${
        sizeStyles[size] || sizeStyles.md
      } ${variantStyles[variant] || variantStyles.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
