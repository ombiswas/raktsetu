import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'outline-sm';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      isLoading = false,
      disabled = false,
      className = '',
      leftIcon,
      rightIcon,
      ...props
    },
    ref
  ) => {
    let variantStyles = 'btn-primary';
    if (variant === 'outline') {
      variantStyles = 'btn-outline';
    } else if (variant === 'outline-sm') {
      variantStyles = 'btn-outline-sm';
    }

    const disabledStyles = disabled || isLoading ? 'opacity-40 cursor-not-allowed pointer-events-none' : '';
    // Mobile min 44px touch target on interactive elements unless small outline
    const touchTargetStyles = variant === 'outline-sm' ? 'min-h-[32px]' : 'min-h-[44px]';

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={`${variantStyles} ${touchTargetStyles} ${disabledStyles} ${className}`.trim()}
        {...props}
      >
        {isLoading && (
          <span
            data-testid="button-spinner"
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"
            aria-hidden="true"
          />
        )}
        {!isLoading && leftIcon && <span className="mr-2 inline-flex items-center">{leftIcon}</span>}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="ml-2 inline-flex items-center">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
