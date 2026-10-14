import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../app/AuthContext.js';
import { loginFormSchema, type LoginFormData } from './auth-schemas.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';

export function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [genericError, setGenericError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: ''
    }
  });

  const onSubmit = async (data: LoginFormData) => {
    setGenericError(null);
    try {
      await login(data.email, data.password);
      const targetPath = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(targetPath, { replace: true });
    } catch {
      // Security: Always return generic error message to prevent user/email enumeration
      setGenericError('Invalid email or password. Please verify your credentials.');
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
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <TextInput
              label="Email Address"
              type="email"
              placeholder="user@example.org"
              autoComplete="username email"
              error={errors.email?.message}
              required
              {...register('email')}
            />

            <TextInput
              label="Password"
              type="password"
              placeholder="••••••••••••"
              autoComplete="current-password"
              error={errors.password?.message}
              required
              {...register('password')}
            />

            {genericError && (
              <div
                role="alert"
                className="p-3 bg-sunset-edge/10 border border-sunset-edge/40 rounded-lg text-xs font-mono text-sunset-glow"
              >
                {genericError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              className="mt-2 w-full"
            >
              Sign In to Session
            </Button>

            <div className="pt-4 border-t border-canvas-subtle/20 flex flex-col gap-2 text-center text-xs text-canvas-muted">
              <div>
                Volunteer donor?{' '}
                <Link to="/register/donor" className="text-canvas-fg underline hover:text-breeze-glow">
                  Register as Donor
                </Link>
              </div>
              <div>
                Healthcare institution?{' '}
                <Link to="/register/hospital" className="text-canvas-fg underline hover:text-breeze-glow">
                  Register Hospital
                </Link>{' '}
                or{' '}
                <Link to="/register/blood-bank" className="text-canvas-fg underline hover:text-breeze-glow">
                  Blood Bank
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginPage;
