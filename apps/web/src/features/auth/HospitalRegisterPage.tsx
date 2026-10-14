import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiFetch } from '../../lib/api/index.js';
import { hospitalRegisterFormSchema, type HospitalRegisterFormData } from './auth-schemas.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { Badge } from '../../components/ui/Badge.js';

export function HospitalRegisterPage(): React.ReactElement {
  const [genericError, setGenericError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<HospitalRegisterFormData>({
    resolver: zodResolver(hospitalRegisterFormSchema),
    defaultValues: {
      name: '',
      registrationNo: '',
      email: '',
      password: '',
      phone: '',
      address: '',
      latitude: 28.6139,
      longitude: 77.209
    }
  });

  const handleAcquireLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setValue('latitude', Number(pos.coords.latitude.toFixed(6)));
          setValue('longitude', Number(pos.coords.longitude.toFixed(6)));
        },
        () => {}
      );
    }
  };

  const onSubmit = async (data: HospitalRegisterFormData) => {
    setGenericError(null);
    try {
      await apiFetch('/api/v1/auth/register/hospital', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.name,
          registrationNo: data.registrationNo,
          phone: data.phone,
          address: data.address,
          location: {
            latitude: data.latitude,
            longitude: data.longitude
          }
        })
      });

      setIsRegistered(true);
    } catch {
      setGenericError('Registration failed. Please verify institutional details or contact administration.');
    }
  };

  if (isRegistered) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-16rem)] p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="flex justify-center mb-2">
              <Badge variant="urgent">REGISTRATION RECEIVED</Badge>
            </div>
            <Eyebrow variant="sunset" className="mb-1">
              STATUS: PENDING ADMIN APPROVAL
            </Eyebrow>
            <CardTitle>Hospital Account Pending Verification</CardTitle>
            <CardDescription>
              Your hospital registration request has been submitted. For clinical safety and compliance, accounts must be approved by the state health administrator before issuing emergency requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link to="/login" className="w-full">
              <Button variant="primary" className="w-full">
                Return to Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)] p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <Eyebrow variant="breeze" className="mb-1">
            CLINICAL INSTITUTION ONBOARDING
          </Eyebrow>
          <CardTitle>Register Healthcare Facility</CardTitle>
          <CardDescription>
            Register a licensed hospital or critical-care clinic to issue real-time emergency blood requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <TextInput
              label="Hospital Name"
              placeholder="e.g. AIIMS Trauma Center"
              autoComplete="organization"
              error={errors.name?.message}
              required
              {...register('name')}
            />

            <TextInput
              label="State / Clinical Registration No."
              placeholder="e.g. DEL-HOSP-2024-889"
              error={errors.registrationNo?.message}
              required
              {...register('registrationNo')}
            />

            <TextInput
              label="Official Contact Email"
              type="email"
              placeholder="bloodbank@hospital.org"
              autoComplete="email"
              error={errors.email?.message}
              required
              {...register('email')}
            />

            <TextInput
              label="Password (min 12 chars)"
              type="password"
              placeholder="••••••••••••"
              autoComplete="new-password"
              error={errors.password?.message}
              required
              {...register('password')}
            />

            <TextInput
              label="Emergency Contact Phone"
              type="tel"
              placeholder="+911126588500"
              autoComplete="tel"
              error={errors.phone?.message}
              required
              {...register('phone')}
            />

            <Textarea
              label="Facility Physical Address"
              placeholder="Full street address including district and PIN code"
              autoComplete="street-address"
              error={errors.address?.message}
              required
              {...register('address')}
            />

            <div className="p-3 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-canvas-muted uppercase tracking-wider">Facility Coordinates</span>
                <button
                  type="button"
                  onClick={handleAcquireLocation}
                  className="text-breeze-glow underline hover:opacity-80"
                >
                  Acquire GPS Coordinates
                </button>
              </div>
              <p className="text-canvas-muted text-[11px]">
                Hospital coordinates are used by donor routing algorithms to compute travel distance bands.
              </p>
            </div>

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
              Submit Hospital for Verification
            </Button>

            <div className="text-center text-xs text-canvas-muted pt-2">
              Already have an account?{' '}
              <Link to="/login" className="text-canvas-fg underline hover:text-breeze-glow">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default HospitalRegisterPage;
