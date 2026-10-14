import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '../../app/AuthContext.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Select } from '../../components/ui/Select.js';

export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('HOSPITAL');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Prototype mock auth / credential validation
      const simulatedToken = 'mock-access-token-jwt-session';
      setAuthSession(
        {
          id: 'user-001',
          email,
          role,
          fullName: role === 'HOSPITAL' ? 'All India Institute of Medical Sciences' : 'Dr. Researcher'
        },
        simulatedToken
      );

      const targetPath = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(targetPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)] p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <Eyebrow variant="sunset" className="mb-1">
            RBAC ACCESS PORTAL
          </Eyebrow>
          <CardTitle>Sign In to RaktSetu</CardTitle>
          <CardDescription>
            Tokens are held strictly in client memory. Rotating refresh cookies require SameSite=Strict same-origin headers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Select
              label="Account Portal Role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              options={[
                { value: 'HOSPITAL', label: 'Hospital Emergency Workspace' },
                { value: 'DONOR', label: 'Volunteer Donor Portal' },
                { value: 'ADMIN', label: 'Research Administrator' }
              ]}
            />

            <TextInput
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@hospital.aiims.edu"
              required
            />

            <TextInput
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />

            {error && (
              <div role="alert" className="p-3 bg-[#1a1c20] border border-[#ff7a17] rounded-[8px] text-xs font-mono text-[#ffc285]">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="mt-2 w-full"
            >
              Sign In to Session
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginPage;
