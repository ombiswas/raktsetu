import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiFetch } from '../../lib/api/index.js';
import { bloodBankRegisterFormSchema, type BloodBankRegisterFormData } from './auth-schemas.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { Badge } from '../../components/ui/Badge.js';

export function BloodBankRegisterPage(): React.ReactElement {
  const [genericError, setGenericError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<BloodBankRegisterFormData>({
    resolver: zodResolver(bloodBankRegisterFormSchema),
    defaultValues: {
      name: '',
      licenseNo: '',
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

  const onSubmit = async (data: BloodBankRegisterFormData) => {
    setGenericError(null);
    try {
      await apiFetch('/api/v1/auth/register/blood-bank', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.name,
          licenseNo: data.licenseNo,
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
      setGenericError('Registration failed. Please verify licensing credentials or contact administrator.');
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
            <CardTitle>Blood Bank Account Pending Approval</CardTitle>
            <CardDescription>
              Your facility registration has been submitted. Blood bank inventory access requires state drug control licensing verification before activation.
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
            TRANSFUSION CENTER REGISTRATION
          </Eyebrow>
          <CardTitle>Register Blood Bank</CardTitle>
          <CardDescription>
            Onboard a licensed regional blood transfusion service to manage reserve inventories and log donor collections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <TextInput
              label="Blood Bank Facility Name"
              placeholder="e.g. Red Cross Regional Transfusion Center"
              autoComplete="organization"
              error={errors.name?.message}
              required
              {...register('name')}
            />

            <TextInput
              label="Drug Control License Number"
              placeholder="e.g. DL-28-BB-2024-001"
              error={errors.licenseNo?.message}
              required
              {...register('licenseNo')}
            />

            <TextInput
              label="Official Contact Email"
              type="email"
              placeholder="operations@bloodbank.org"
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
              label="Facility Phone Number"
              type="tel"
              placeholder="+911123716441"
              autoComplete="tel"
              error={errors.phone?.message}
              required
              {...register('phone')}
            />

            <Textarea
              label="Physical Facility Address"
              placeholder="Full address of the blood bank / storage facility"
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
                Facility coordinates are used to calculate travel times for emergency blood dispatch.
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
              Submit Blood Bank for Verification
            </Button>

            <div className="text-center text-xs text-canvas-muted pt-2">
              Already registered?{' '}
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

export default BloodBankRegisterPage;
