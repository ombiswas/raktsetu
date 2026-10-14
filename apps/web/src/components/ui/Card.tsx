import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'soft';
}

export function Card({
  variant = 'default',
  className = '',
  children,
  ...props
}: CardProps): React.ReactElement {
  const bg = variant === 'soft' ? 'bg-[#1a1c20]' : 'bg-[#191919]';

  return (
    <div
      className={`${bg} border border-[#212327] rounded-[8px] p-6 shadow-none transition-colors ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div className={`flex flex-col gap-1.5 mb-4 ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
  return (
    <h3
      className={`text-lg font-normal text-[#ffffff] tracking-tight leading-snug ${className}`.trim()}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return (
    <p className={`text-sm text-[#7d8187] font-normal leading-normal ${className}`.trim()} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div className={`${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={`flex items-center justify-between pt-4 mt-4 border-t border-[#212327] ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
