import React from 'react';

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  onClick,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-theme-primary hover:bg-theme-primary-hover text-white shadow-sm border border-transparent',
    secondary:
      'bg-theme-surface hover:bg-opacity-80 text-theme-text border border-theme-border',
    outline:
      'bg-transparent hover:bg-theme-surface text-theme-text border border-theme-border',
    ghost:
      'bg-transparent hover:bg-theme-surface text-theme-text-secondary hover:text-theme-text',
    danger:
      'bg-red-600 hover:bg-red-700 text-white border border-transparent',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size] || sizeStyles.md} ${
        variantStyles[variant] || variantStyles.primary
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
