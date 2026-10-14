import React from 'react';
import { Eyebrow } from './Eyebrow.js';

export interface EmptyStateProps {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  eyebrow = 'NO DATA',
  title,
  description,
  action,
  icon,
  className = ''
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={`w-full bg-[#1a1c20] border border-[#212327] rounded-[8px] p-12 text-center flex flex-col items-center justify-center ${className}`.trim()}
    >
      {icon && <div className="mb-4 text-[#7d8187] text-2xl">{icon}</div>}
      <Eyebrow size="sm" className="mb-2">
        {eyebrow}
      </Eyebrow>
      <h3 className="text-base font-normal text-[#ffffff] mb-1.5">{title}</h3>
      <p className="text-sm text-[#7d8187] max-w-md mx-auto mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
