import React from 'react';

export interface SidebarRowItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}

export interface AppShellProps {
  navBar: React.ReactNode;
  sidebarItems?: SidebarRowItem[];
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AppShell({
  navBar,
  sidebarItems,
  children,
  footer
}: AppShellProps): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#dadbdf] flex flex-col font-sans">
      {/* Accessibility Skip Link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Primary Sticky Header */}
      {navBar}

      <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col md:flex-row">
        {/* Sidebar Nav (Desktop >= 768px) */}
        {sidebarItems && sidebarItems.length > 0 && (
          <aside
            aria-label="Sidebar Navigation"
            className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#212327] p-4 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible shrink-0"
          >
            {sidebarItems.map((item) => {
              const Tag = item.href ? 'a' : 'button';
              const activeClass = item.active
                ? 'bg-[#1a1c20] text-[#ffffff] border-[#212327]'
                : 'bg-transparent text-[#7d8187] hover:text-[#ffffff] hover:bg-[#1a1c20]/50 border-transparent';

              return (
                <Tag
                  key={item.id}
                  href={item.href}
                  onClick={item.onClick}
                  aria-current={item.active ? 'page' : undefined}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-[8px] border text-sm font-normal transition-colors text-left no-underline whitespace-nowrap md:whitespace-normal ${activeClass}`}
                >
                  <div className="flex items-center gap-2.5">
                    {item.icon && <span className="text-[#dadbdf]">{item.icon}</span>}
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#191919] border border-[#212327] text-[#dadbdf]">
                      {item.badge}
                    </span>
                  )}
                </Tag>
              );
            })}
          </aside>
        )}

        {/* Semantic Main Landmark */}
        <main id="main-content" tabIndex={-1} className="flex-1 p-6 md:p-8 outline-none">
          {children}
        </main>
      </div>

      {/* Semantic Footer */}
      {footer ? (
        <footer className="border-t border-[#212327] py-6 px-6 text-xs text-[#7d8187] text-center">
          {footer}
        </footer>
      ) : (
        <footer className="border-t border-[#212327] py-6 px-6 text-xs text-[#7d8187] text-center">
          <p>© 2026 RaktSetu · Academic Research Prototype · No Clinical Decisions</p>
        </footer>
      )}
    </div>
  );
}
