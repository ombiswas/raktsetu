import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiFetch } from '../../lib/api/index.js';
import { useAuth } from '../../app/AuthContext.js';
import { donorRegisterFormSchema, type DonorRegisterFormData, bloodGroupValues, sexValues } from './auth-schemas.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Select } from '../../components/ui/Select.js';

export function DonorRegisterPage(): React.ReactElement {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [genericError, setGenericError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<DonorRegisterFormData>({
    resolver: zodResolver(donorRegisterFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      phone: '',
      bloodGroup: 'O+',
      dateOfBirth: '2000-01-01',
      weightKg: 65,
      sex: 'male',
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
        () => {
          // Keep defaults if user declines
        }
      );
    }
  };

  const onSubmit = async (data: DonorRegisterFormData) => {
    setGenericError(null);
    try {
      await apiFetch('/api/v1/auth/register/donor', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          fullName: data.fullName,
          phone: data.phone,
          bloodGroup: data.bloodGroup,
          dateOfBirth: data.dateOfBirth,
          weightKg: data.weightKg,
          sex: data.sex,
          location: {
            latitude: data.latitude,
            longitude: data.longitude
          }
        })
      });

      // Automatically sign in the donor
      await login(data.email, data.password);
      navigate('/donor', { replace: true });
    } catch {
      setGenericError('Registration could not be completed. Please check your information or try again.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)] p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <Eyebrow variant="breeze" className="mb-1">
            VOLUNTEER DONOR ONBOARDING
          </Eyebrow>
          <CardTitle>Register as Blood Donor</CardTitle>
          <CardDescription>
            Join the verified volunteer donor registry. Blood donor accounts are activated immediately for emergency matching.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <TextInput
              label="Full Name"
              placeholder="e.g. Rahul Sharma"
              autoComplete="name"
              error={errors.fullName?.message}
              required
              {...register('fullName')}
            />

            <TextInput
              label="Email Address"
              type="email"
              placeholder="donor@example.com"
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
              label="Phone Number (E.164)"
              type="tel"
              placeholder="+919876543210"
              autoComplete="tel"
              error={errors.phone?.message}
              required
              {...register('phone')}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Blood Group"
                options={bloodGroupValues.map((bg) => ({ value: bg, label: bg }))}
                error={errors.bloodGroup?.message}
                {...register('bloodGroup')}
              />

              <Select
                label="Sex"
                options={sexValues.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                error={errors.sex?.message}
                {...register('sex')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                label="Date of Birth"
                type="date"
                error={errors.dateOfBirth?.message}
                required
                {...register('dateOfBirth')}
              />

              <TextInput
                label="Weight (kg, min 45)"
                type="number"
                error={errors.weightKg?.message}
                required
                {...register('weightKg')}
              />
            </div>

            <div className="p-3 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-canvas-muted uppercase tracking-wider">Baseline Location</span>
                <button
                  type="button"
                  onClick={handleAcquireLocation}
                  className="text-breeze-glow underline hover:opacity-80"
                >
                  Use Device GPS
                </button>
              </div>
              <p className="text-canvas-muted text-[11px]">
                Your exact coordinates remain private and are only used for coarse distance matching.
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
              Complete Donor Registration
            </Button>

            <div className="text-center text-xs text-canvas-muted pt-2">
              Already registered?{' '}
              <Link to="/login" className="text-canvas-fg underline hover:text-breeze-glow">
                Sign in to your account
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default DonorRegisterPage;
