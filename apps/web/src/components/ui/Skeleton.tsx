import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rect' | 'text' | 'circle';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  className = '',
  style,
  ...props
}: SkeletonProps): React.ReactElement {
  let rounded = 'rounded-[8px]';
  if (variant === 'circle') rounded = 'rounded-full';
  if (variant === 'text') rounded = 'rounded-[4px]';

  return (
    <div
      role="status"
      aria-label="Loading content"
      style={{
        width,
        height,
        ...style
      }}
      className={`bg-[#1a1c20] border border-[#212327] animate-pulse ${rounded} ${className}`.trim()}
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}
