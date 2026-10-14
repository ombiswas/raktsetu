import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { Badge } from '../../components/ui/Badge.js';

export function PendingApprovalPage(): React.ReactElement {
  const { user, logout } = useAuth();

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)] p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <Badge variant="urgent">PENDING VERIFICATION</Badge>
          </div>
          <Eyebrow variant="sunset" className="mb-1">
            REGULATORY COMPLIANCE GATE
          </Eyebrow>
          <CardTitle>Account Pending Verification</CardTitle>
          <CardDescription>
            Institutional accounts (Hospitals and Blood Banks) must be verified by the State Blood Transfusion Council before accessing emergency blood request and inventory systems.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg text-xs text-left space-y-1">
            <div className="text-canvas-muted font-mono uppercase text-[10px]">Submitted Account</div>
            <div className="text-canvas-fg font-medium">{user?.email ?? 'Institutional representative'}</div>
            <div className="text-canvas-muted text-[11px] pt-1">
              Your registration number and contact credentials have been submitted for administrator review. You will receive authorization confirmation upon verification.
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            {user ? (
              <Button variant="outline" onClick={logout} className="w-full">
                Sign Out of Pending Account
              </Button>
            ) : (
              <Link to="/login" className="w-full">
                <Button variant="outline" className="w-full">
                  Return to Sign In
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PendingApprovalPage;
