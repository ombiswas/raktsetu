import React, { Suspense, lazy } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary.js';
import { AuthProvider, useAuth } from './AuthContext.js';
import { RouteGuard } from './RouteGuard.js';
import { AppShell, type SidebarRowItem } from '../components/ui/AppShell.js';
import { NavBar, type NavItem } from '../components/ui/NavBar.js';
import { Spinner } from '../components/ui/Spinner.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';

// Lazy Loaded Feature Routes
const OverviewPage = lazy(() => import('../features/overview/OverviewPage.js'));
const HospitalPage = lazy(() => import('../features/hospital/HospitalPage.js'));
const DonorPage = lazy(() => import('../features/donor/DonorPage.js'));
const RespondToRequestPage = lazy(() => import('../features/donor/RespondToRequestPage.js'));
const ResearchPage = lazy(() => import('../features/research/ResearchPage.js'));
const LoginPage = lazy(() => import('../features/auth/LoginPage.js'));
const DonorRegisterPage = lazy(() => import('../features/auth/DonorRegisterPage.js'));
const HospitalRegisterPage = lazy(() => import('../features/auth/HospitalRegisterPage.js'));
const BloodBankRegisterPage = lazy(() => import('../features/auth/BloodBankRegisterPage.js'));
const PendingApprovalPage = lazy(() => import('../features/auth/PendingApprovalPage.js'));
const NotFoundPage = lazy(() => import('../features/not-found/NotFoundPage.js'));
const DesignCheckPage = lazy(() => import('../features/design-check/DesignCheckPage.js'));

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
  const { user, isAuthenticated, logout } = useAuth();

  const isDev = Boolean(import.meta.env.DEV);

  const navItems: NavItem[] = [
    { label: 'Overview', href: '/', active: location.pathname === '/' },
    { label: 'Hospital Emergency', href: '/hospital', active: location.pathname === '/hospital' },
    { label: 'Donor Portal', href: '/donor', active: location.pathname.startsWith('/donor') },
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
      label: 'Donor Alerts & Hub',
      href: '/donor',
      active: location.pathname.startsWith('/donor'),
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
      <div className="hidden sm:flex items-center gap-2">
        <span className="text-xs font-mono text-canvas-fg">
          {user?.fullName || user?.email}
        </span>
        <Badge variant={user?.role === 'donor' ? 'info' : 'urgent'}>
          {user?.role.toUpperCase()}
        </Badge>
      </div>
      <Button variant="outline-sm" onClick={logout}>
        Sign Out
      </Button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Button variant="outline-sm" onClick={() => navigate('/login')}>
        Sign In
      </Button>
    </div>
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
          {/* Public / General Routes */}
          <Route path="/" element={<OverviewPage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register/donor" element={<DonorRegisterPage />} />
          <Route path="/register/hospital" element={<HospitalRegisterPage />} />
          <Route path="/register/blood-bank" element={<BloodBankRegisterPage />} />
          <Route path="/pending-approval" element={<PendingApprovalPage />} />

          {/* Role-Guarded Donor Portal */}
          <Route
            path="/donor"
            element={
              <RouteGuard allowedRoles={['donor']}>
                <DonorPage />
              </RouteGuard>
            }
          />
          <Route
            path="/donor/requests/:id"
            element={
              <RouteGuard allowedRoles={['donor']}>
                <RespondToRequestPage />
              </RouteGuard>
            }
          />

          {/* Role-Guarded Hospital Emergency Workspace */}
          <Route
            path="/hospital"
            element={
              <RouteGuard allowedRoles={['hospital', 'admin']}>
                <HospitalPage />
              </RouteGuard>
            }
          />

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
