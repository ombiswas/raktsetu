import React from 'react';

export interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'sunset' | 'breeze';
  size?: 'sm' | 'md';
}

export function Eyebrow({
  variant = 'default',
  size = 'sm',
  className = '',
  children,
  ...props
}: EyebrowProps): React.ReactElement {
  let color = 'text-[#7d8187]';
  if (variant === 'sunset') color = 'text-[#ffc285]';
  if (variant === 'breeze') color = 'text-[#a0c3ec]';

  const sizeClass = size === 'sm' ? 'eyebrow-mono text-xs' : 'caption-mono text-sm';

  return (
    <span
      className={`${sizeClass} ${color} inline-block select-none ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
