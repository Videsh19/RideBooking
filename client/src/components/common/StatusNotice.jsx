import React from 'react';
import { AlertCircle, Info, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function StatusNotice({
  type = 'info',
  title,
  message,
  children,
  className = '',
}) {
  const configs = {
    info: {
      border: 'border-blue-900/40 dark:border-blue-800/40',
      bg: 'bg-blue-50 dark:bg-blue-950/20',
      text: 'text-blue-900 dark:text-blue-200',
      icon: Info,
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    warning: {
      border: 'border-amber-900/40 dark:border-amber-800/40',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      text: 'text-amber-900 dark:text-amber-200',
      icon: AlertCircle,
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    phase: {
      border: 'border-purple-900/40 dark:border-purple-800/40',
      bg: 'bg-purple-50 dark:bg-purple-950/20',
      text: 'text-purple-900 dark:text-purple-200',
      icon: ShieldAlert,
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    success: {
      border: 'border-emerald-900/40 dark:border-emerald-800/40',
      bg: 'bg-emerald-50 dark:bg-emerald-950/20',
      text: 'text-emerald-900 dark:text-emerald-200',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  };

  const cfg = configs[type] || configs.info;
  const Icon = cfg.icon;

  return (
    <div
      className={`rounded-lg border p-4 ${cfg.bg} ${cfg.border} ${cfg.text} ${className}`}
      role="region"
      aria-label={title || 'Status notice'}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.iconColor}`} />
        <div className="text-xs leading-relaxed flex-1">
          {title && <p className="font-semibold text-sm mb-1">{title}</p>}
          {message && <p>{message}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
