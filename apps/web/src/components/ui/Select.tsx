import React, { useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
  helperText?: string | undefined;
  options?: SelectOption[] | undefined;
  placeholder?: string | undefined;
  containerClassName?: string | undefined;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      id: customId,
      label,
      error,
      helperText,
      options,
      placeholder,
      children,
      required,
      disabled,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = customId || `select-${generatedId}`;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
        <label
          htmlFor={selectId}
          className="text-xs uppercase tracking-[1.2px] font-mono text-[#dadbdf] flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-[#ff7a17] ml-1">*</span>}
          </span>
        </label>

        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`input-surface min-h-[44px] w-full px-3.5 py-2.5 rounded-[8px] bg-[#1a1c20] text-[#ffffff] border text-sm transition-colors cursor-pointer ${
            error ? 'border-[#ff7a17]' : 'border-[#212327] focus:border-[#ffffff]'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`.trim()}
          {...props}
        >
          {placeholder && (
            <option value="" disabled className="bg-[#1a1c20] text-[#7d8187]">
              {placeholder}
            </option>
          )}
          {options
            ? options.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className="bg-[#1a1c20] text-[#ffffff]"
                >
                  {opt.label}
                </option>
              ))
            : children}
        </select>

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

Select.displayName = 'Select';
