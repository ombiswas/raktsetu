import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from './AuthContext.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card.js';
import { Eyebrow } from '../components/ui/Eyebrow.js';
import { Button } from '../components/ui/Button.js';
import { Skeleton } from '../components/ui/Skeleton.js';

export interface RouteGuardProps {
  allowedRoles?: UserRole[];
  allowPending?: boolean;
  children: React.ReactNode;
}

export function RouteGuard({
  allowedRoles,
  allowPending = false,
  children
}: RouteGuardProps): React.ReactElement | null {
  const { user, role, status, isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  // 1. Session bootstrap state: render accessible skeleton without flashing protected content
  if (isBootstrapping) {
    return (
      <div
        data-testid="route-guard-skeleton"
        className="p-8 max-w-4xl mx-auto space-y-6"
        aria-busy="true"
        aria-label="Restoring session"
      >
        <Skeleton variant="text" className="w-56 h-8" />
        <Skeleton variant="rect" className="h-48" />
        <Skeleton variant="text" className="w-full h-12" />
      </div>
    );
  }

  // 2. Unauthenticated redirect to login with return path
  if (!isAuthenticated || !user) {
    if (location.pathname === '/login') {
      return null;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Pending approval state for organizations (hospitals / blood banks)
  if (status === 'pending' && !allowPending && location.pathname !== '/pending-approval') {
    return <Navigate to="/pending-approval" replace />;
  }

  // 4. Role restriction boundary
  if (allowedRoles && allowedRoles.length > 0 && role && !allowedRoles.includes(role)) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[50vh]">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <Eyebrow variant="sunset" className="mb-2">
              RESTRICTED RBAC BOUNDARY
            </Eyebrow>
            <CardTitle>Role Access Denied</CardTitle>
            <CardDescription>
              Your authenticated role ({role.toUpperCase()}) does not have permission to access this module.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-canvas-muted">
              Deterministic security boundaries prevent unauthorized data access across roles.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                const target =
                  role === 'donor'
                    ? '/donor'
                    : role === 'hospital'
                    ? '/hospital'
                    : role === 'blood_bank'
                    ? '/blood-bank'
                    : '/overview';
                window.location.href = target;
              }}
            >
              Go to Your Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
