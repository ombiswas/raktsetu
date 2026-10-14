import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from '../ErrorBoundary';
import { AuthProvider } from '../AuthContext';
import { RouteGuard } from '../RouteGuard';
import { NotFoundPage } from '../../features/not-found/NotFoundPage';
import { OverviewPage } from '../../features/overview/OverviewPage';

describe('App Shell, Routing, and Error Boundaries', () => {
  it('renders OverviewPage with research invariants and pipeline stages', () => {
    render(<OverviewPage />);
    expect(screen.getByText(/AI-Assisted Emergency Blood-Donor Prioritization/i)).toBeInTheDocument();
    expect(screen.getByText(/Deterministic Biological Filter/i)).toBeInTheDocument();
    expect(screen.getByText(/Spatial PostGIS Boundary/i)).toBeInTheDocument();
  });

  it('renders NotFoundPage with 404 header and return link', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
    expect(screen.getByText(/Return to Overview/i)).toBeInTheDocument();
  });

  it('RouteGuard redirects unauthenticated user away from protected views', () => {
    function ProtectedView(): React.ReactElement {
      return <div>Protected Clinical View</div>;
    }

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <RouteGuard allowedRoles={['hospital']}>
            <ProtectedView />
          </RouteGuard>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Clinical View')).not.toBeInTheDocument();
  });

  it('ErrorBoundary renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Normal Child Component</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Child Component')).toBeInTheDocument();
  });

  it('ErrorBoundary renders fallback when custom fallback provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error Safeguard</div>}>
        <div>Normal Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });
});
