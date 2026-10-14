import React, { useId } from 'react';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  helperText?: string | undefined;
  containerClassName?: string | undefined;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      id: customId,
      label,
      error,
      helperText,
      required,
      disabled,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = customId || `input-${generatedId}`;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        <label
          htmlFor={inputId}
          className="text-xs uppercase tracking-[1.2px] font-mono text-[#dadbdf] flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-[#ff7a17] ml-1">*</span>}
          </span>
        </label>

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`input-surface min-h-[44px] w-full px-3.5 py-2.5 rounded-[8px] bg-[#1a1c20] text-[#ffffff] border text-sm transition-colors ${
            error ? 'border-[#ff7a17]' : 'border-[#212327] focus:border-[#ffffff]'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`.trim()}
          {...props}
        />

        {error && (
          <p id={errorId} role="alert" className="text-xs font-mono text-[#ffc285] mt-0.5">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-[#7d8187] mt-0.5">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

TextInput.displayName = 'TextInput';
