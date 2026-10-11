import React from 'react';

export default function LoadingSpinner({
  size = 'md',
  label = 'Loading...',
  className = '',
}) {
  const sizeMap = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 text-theme-text-secondary ${className}`}>
      <div
        className={`${sizeMap[size] || sizeMap.md} rounded-full border-theme-border border-t-theme-primary animate-spin`}
        role="status"
        aria-label={label}
      />
      {label && <span className="text-xs font-medium">{label}</span>}
    </div>
  );
}
