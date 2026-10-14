import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from './AuthContext.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card.js';
import { Eyebrow } from '../components/ui/Eyebrow.js';
import { Button } from '../components/ui/Button.js';

export interface RouteGuardProps {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
}

export function RouteGuard({ allowedRoles, children }: RouteGuardProps): React.ReactElement | null {
  const { user, role, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    if (location.pathname === '/login') {
      return null;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && role && !allowedRoles.includes(role)) {
    return (
      <div className="flex items-center justify-center p-8">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <Eyebrow variant="sunset" className="mb-2">
              RESTRICTED RBAC BOUNDARY
            </Eyebrow>
            <CardTitle>Role Access Denied</CardTitle>
            <CardDescription>
              Your authenticated role ({role}) does not have permission to access this module.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => window.history.back()}>
              Return to Previous View
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
