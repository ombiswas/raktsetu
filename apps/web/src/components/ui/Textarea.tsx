import React, { useId } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  helperText?: string | undefined;
  containerClassName?: string | undefined;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      id: customId,
      label,
      error,
      helperText,
      required,
      disabled,
      rows = 4,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = customId || `textarea-${generatedId}`;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        <label
          htmlFor={textareaId}
          className="text-xs uppercase tracking-[1.2px] font-mono text-[#dadbdf] flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-[#ff7a17] ml-1">*</span>}
          </span>
        </label>

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`input-surface min-h-[44px] w-full px-3.5 py-2.5 rounded-[8px] bg-[#1a1c20] text-[#ffffff] border text-sm transition-colors resize-y ${
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

Textarea.displayName = 'Textarea';
