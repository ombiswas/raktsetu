import React, { useEffect, useRef, useId } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md'
}: ModalProps): React.ReactElement | null {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const id = useId();
  const titleId = `modal-title-${id}`;
  const descId = `modal-desc-${id}`;

  // Save the currently focused element before opening modal, and restore on close
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Prevent background scrolling
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Focus first focusable element inside modal
      if (modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.getAttribute('aria-hidden') !== 'true');

        if (focusables.length > 0 && focusables[0]) {
          focusables[0].focus();
        } else {
          modalRef.current.focus();
        }
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }
    return undefined;
  }, [isOpen]);

  // Esc key and Tab focus trap listener
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.getAttribute('aria-hidden') !== 'true');

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first && last) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last && first) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let widthClass = 'max-w-md';
  if (maxWidth === 'sm') widthClass = 'max-w-sm';
  if (maxWidth === 'lg') widthClass = 'max-w-lg';
  if (maxWidth === 'xl') widthClass = 'max-w-xl';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0a0a]/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${widthClass} bg-[#191919] border border-[#212327] rounded-[8px] p-6 shadow-none outline-none relative`}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id={titleId} className="text-lg font-normal text-[#ffffff] tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-[#7d8187] mt-1 font-normal">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full border border-[#212327] hover:border-[#ffffff] flex items-center justify-center text-[#dadbdf] hover:text-[#ffffff] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="text-sm text-[#dadbdf] mb-6">{children}</div>

        {footer && <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#212327]">{footer}</div>}
      </div>
    </div>
  );
}
