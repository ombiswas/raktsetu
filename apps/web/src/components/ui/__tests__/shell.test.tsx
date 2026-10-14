import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavBar } from '../NavBar.js';
import { AppShell, type SidebarRowItem } from '../AppShell.js';

describe('Layout Shell Primitives (NavBar, AppShell)', () => {
  const navItems = [
    { label: 'Overview', href: '/', active: true },
    { label: 'Hospital', href: '/hospital' },
    { label: 'Donor', href: '/donor' }
  ];

  describe('NavBar', () => {
    it('renders simulation banner and navigation items', () => {
      render(<NavBar items={navItems} brandName="RaktSetu" />);

      expect(screen.getByText(/simulation run/i)).toBeInTheDocument();
      expect(screen.getByText('RaktSetu')).toBeInTheDocument();
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Hospital')).toBeInTheDocument();
    });

    it('toggles mobile menu on small screens', async () => {
      const user = userEvent.setup();
      render(<NavBar items={navItems} />);

      const toggleBtn = screen.getByRole('button', { name: /toggle navigation menu/i });
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByLabelText('Mobile Navigation')).toBeInTheDocument();
    });
  });

  describe('AppShell', () => {
    const sidebarItems: SidebarRowItem[] = [
      { id: '1', label: 'Dashboard', active: true },
      { id: '2', label: 'Active Dispatches', badge: 3 }
    ];

    it('renders skip link, sidebar items, and main landmark', () => {
      render(
        <AppShell
          navBar={<NavBar items={navItems} />}
          sidebarItems={sidebarItems}
        >
          <div data-testid="page-body">Page Content</div>
        </AppShell>
      );

      const skipLink = screen.getByRole('link', { name: /skip to main content/i });
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');

      const main = screen.getByRole('main');
      expect(main).toHaveAttribute('id', 'main-content');
      expect(screen.getByTestId('page-body')).toBeInTheDocument();

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Active Dispatches')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('handles clicking sidebar row', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      const items: SidebarRowItem[] = [
        { id: '1', label: 'Live Queue', onClick: handleClick }
      ];

      render(
        <AppShell navBar={<div>Nav</div>} sidebarItems={items}>
          <div>Content</div>
        </AppShell>
      );

      const itemBtn = screen.getByRole('button', { name: /live queue/i });
      await user.click(itemBtn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
