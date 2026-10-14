import React, { useEffect } from 'react';

export interface ToastProps {
  id?: string;
  title: string;
  description?: string;
  variant?: 'default' | 'urgent' | 'info';
  onDismiss?: () => void;
  durationMs?: number;
}

export function Toast({
  title,
  description,
  variant = 'default',
  onDismiss,
  durationMs = 5000
}: ToastProps): React.ReactElement {
  useEffect(() => {
    if (!durationMs || !onDismiss) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  let borderStyle = 'border-[#212327]';
  let badgeText = 'NOTICE';
  let badgeColor = 'text-[#7d8187]';

  if (variant === 'urgent') {
    borderStyle = 'border-[#ff7a17]';
    badgeText = 'CRITICAL';
    badgeColor = 'text-[#ffc285]';
  } else if (variant === 'info') {
    borderStyle = 'border-[#a0c3ec]';
    badgeText = 'INFO';
    badgeColor = 'text-[#a0c3ec]';
  }

  return (
    <div
      role={variant === 'urgent' ? 'alert' : 'status'}
      aria-live={variant === 'urgent' ? 'assertive' : 'polite'}
      className={`min-w-[320px] max-w-md bg-[#191919] border ${borderStyle} rounded-[8px] p-4 shadow-none flex items-start gap-3 transition-all`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-mono tracking-widest uppercase ${badgeColor}`}>
            {badgeText}
          </span>
          <h4 className="text-sm font-normal text-[#ffffff]">{title}</h4>
        </div>
        {description && <p className="text-xs text-[#7d8187] mt-0.5">{description}</p>}
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-[#7d8187] hover:text-[#ffffff] text-xs p-1"
        >
          ✕
        </button>
      )}
    </div>
  );
}
