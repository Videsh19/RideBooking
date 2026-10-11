import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No items found',
  description = 'There are no active records in this view.',
  action,
  className = '',
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-theme-border bg-theme-surface bg-opacity-20 ${className}`}
    >
      <div className="w-10 h-10 rounded-lg bg-theme-surface flex items-center justify-center text-theme-text-secondary mb-3 border border-theme-border">
        <Icon className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-semibold text-theme-text mb-1">{title}</h4>
      <p className="text-xs text-theme-text-secondary max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
