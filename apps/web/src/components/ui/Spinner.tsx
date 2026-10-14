import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export function Spinner({
  size = 'md',
  label = 'Loading',
  className = ''
}: SpinnerProps): React.ReactElement {
  let sizeClass = 'w-5 h-5 border-2';
  if (size === 'sm') sizeClass = 'w-4 h-4 border-2';
  if (size === 'lg') sizeClass = 'w-8 h-8 border-2';

  return (
    <div
      role="status"
      aria-label={label}
      className={`inline-flex items-center justify-center ${className}`}
    >
      <div
        className={`${sizeClass} border-[#212327] border-t-[#ffffff] rounded-full animate-spin`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
