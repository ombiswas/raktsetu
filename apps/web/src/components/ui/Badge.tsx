import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'urgent' | 'info' | 'success';
  dot?: boolean;
}

export function Badge({
  variant = 'neutral',
  dot = false,
  className = '',
  children,
  ...props
}: BadgeProps): React.ReactElement {
  let badgeStyles = 'border-[#212327] bg-[#1a1c20] text-[#dadbdf]';
  let dotStyles = 'bg-[#dadbdf]';

  if (variant === 'urgent') {
    badgeStyles = 'border-[#ff7a17] bg-[#1a1c20] text-[#ffc285]';
    dotStyles = 'bg-[#ff7a17] animate-pulse';
  } else if (variant === 'info') {
    badgeStyles = 'border-[#a0c3ec] bg-[#1a1c20] text-[#a0c3ec]';
    dotStyles = 'bg-[#a0c3ec]';
  } else if (variant === 'success') {
    badgeStyles = 'border-[#ffffff] bg-[#1a1c20] text-[#ffffff]';
    dotStyles = 'bg-[#ffffff]';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-mono tracking-wider uppercase ${badgeStyles} ${className}`.trim()}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles}`} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
