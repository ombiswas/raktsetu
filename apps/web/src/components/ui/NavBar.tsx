import React, { useState } from 'react';

export interface NavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface NavBarProps {
  items: NavItem[];
  brandName?: string;
  version?: string;
  simulationTag?: string;
  rightAction?: React.ReactNode;
  onNavigate?: (href: string) => void;
}

export function NavBar({
  items,
  brandName = 'RaktSetu',
  version = 'v0.1.0-alpha',
  simulationTag = 'ACADEMIC RESEARCH PROTOTYPE // SIMULATION RUN',
  rightAction,
  onNavigate
}: NavBarProps): React.ReactElement {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#212327] bg-[#0a0a0a]/90 backdrop-blur">
      {/* Simulation Prototype Banner */}
      <div className="bg-[#1a1c20] border-b border-[#212327] px-6 py-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#ff7a17] animate-pulse" aria-hidden="true" />
          <span className="caption-mono-sm text-[#ffc285]">{simulationTag}</span>
        </div>
        <span className="text-[#7d8187] text-[11px] hidden sm:inline">
          No Clinical Decisions · Deterministic Hard Constraints Enforced First
        </span>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a
            href="/"
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate('/');
              }
            }}
            className="flex items-center gap-3 no-underline text-[#ffffff]"
          >
            <span className="text-xl font-normal tracking-tight text-[#ffffff]">{brandName}</span>
            <span className="text-[11px] font-mono tracking-wider text-[#7d8187] border border-[#212327] px-2 py-0.5 rounded-full">
              {version}
            </span>
          </a>

          {/* Desktop Nav Items */}
          <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-1">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  if (onNavigate) {
                    e.preventDefault();
                    onNavigate(item.href);
                  }
                }}
                className={`px-3.5 py-1.5 rounded-full text-sm font-normal transition-colors no-underline ${
                  item.active
                    ? 'text-[#ffffff] bg-[#1a1c20] border border-[#212327]'
                    : 'text-[#dadbdf] hover:text-[#ffffff] hover:bg-[#1a1c20]/50'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        {/* Right Action & Mobile Toggle */}
        <div className="flex items-center gap-3">
          {rightAction && <div className="hidden sm:block">{rightAction}</div>}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-[8px] border border-[#212327] text-[#dadbdf] hover:text-[#ffffff]"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden border-t border-[#212327] bg-[#1a1c20] px-4 py-4 flex flex-col gap-2"
        >
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                setMobileMenuOpen(false);
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate(item.href);
                }
              }}
              className={`px-3.5 py-2.5 rounded-[8px] text-sm font-normal transition-colors no-underline block ${
                item.active
                  ? 'text-[#ffffff] bg-[#0a0a0a] border border-[#212327]'
                  : 'text-[#dadbdf] hover:text-[#ffffff]'
              }`}
            >
              {item.label}
            </a>
          ))}
          {rightAction && <div className="pt-2 border-t border-[#212327] mt-2">{rightAction}</div>}
        </nav>
      )}
    </header>
  );
}
