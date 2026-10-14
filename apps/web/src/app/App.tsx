import React, { Suspense, lazy } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { AuthProvider, useAuth } from './AuthContext';
import { AppShell, type SidebarRowItem } from '../components/ui/AppShell';
import { NavBar, type NavItem } from '../components/ui/NavBar';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';

// Lazy Loaded Feature Routes
const OverviewPage = lazy(() => import('../features/overview/OverviewPage'));
const HospitalPage = lazy(() => import('../features/hospital/HospitalPage'));
const DonorPage = lazy(() => import('../features/donor/DonorPage'));
const ResearchPage = lazy(() => import('../features/research/ResearchPage'));
const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const NotFoundPage = lazy(() => import('../features/not-found/NotFoundPage'));
const DesignCheckPage = lazy(() => import('../features/design-check/DesignCheckPage'));

function LoadingFallback(): React.ReactElement {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Spinner size="lg" label="Loading application module" />
    </div>
  );
}

function AppContent(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, clearAuthSession } = useAuth();

  const isDev = Boolean(import.meta.env.DEV);

  const navItems: NavItem[] = [
    { label: 'Overview', href: '/', active: location.pathname === '/' },
    { label: 'Hospital Emergency', href: '/hospital', active: location.pathname === '/hospital' },
    { label: 'Donor Portal', href: '/donor', active: location.pathname === '/donor' },
    { label: 'Benchmark Metrics', href: '/research', active: location.pathname === '/research' },
    ...(isDev
      ? [{ label: 'Design Check', href: '/design-check', active: location.pathname === '/design-check' }]
      : [])
  ];

  const sidebarItems: SidebarRowItem[] = [
    {
      id: 'overview',
      label: 'System Overview',
      href: '/',
      active: location.pathname === '/',
      onClick: (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        navigate('/');
      }
    },
    {
      id: 'hospital',
      label: 'Hospital Dispatch',
      href: '/hospital',
      badge: 'URGENT',
      active: location.pathname === '/hospital',
      onClick: (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        navigate('/hospital');
      }
    },
    {
      id: 'donor',
      label: 'Donor Alerts',
      href: '/donor',
      active: location.pathname === '/donor',
      onClick: (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        navigate('/donor');
      }
    },
    {
      id: 'research',
      label: 'Benchmark Metrics',
      href: '/research',
      active: location.pathname === '/research',
      onClick: (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        navigate('/research');
      }
    },
    ...(isDev
      ? [
          {
            id: 'design-check',
            label: 'Design Tokens Audit',
            href: '/design-check',
            badge: 'DEV',
            active: location.pathname === '/design-check',
            onClick: (e?: React.MouseEvent) => {
              if (e) e.preventDefault();
              navigate('/design-check');
            }
          }
        ]
      : [])
  ];

  const rightAction = isAuthenticated ? (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-[#dadbdf] hidden sm:inline">
        {user?.email} ({user?.role})
      </span>
      <Button variant="outline-sm" onClick={clearAuthSession}>
        Sign Out
      </Button>
    </div>
  ) : (
    <Button variant="outline-sm" onClick={() => navigate('/login')}>
      Sign In
    </Button>
  );

  return (
    <AppShell
      navBar={
        <NavBar
          items={navItems}
          rightAction={rightAction}
          onNavigate={(href) => navigate(href)}
        />
      }
      sidebarItems={sidebarItems}
    >
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/hospital" element={<HospitalPage />} />
          <Route path="/donor" element={<DonorPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Dev-only route */}
          {isDev && <Route path="/design-check" element={<DesignCheckPage />} />}

          {/* 404 Catch-All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
