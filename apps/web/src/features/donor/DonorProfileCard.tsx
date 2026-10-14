import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiFetch } from '../../lib/api/index.js';
import type { DonorProfile } from './donor-types.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';
import { TextInput } from '../../components/ui/TextInput.js';
import { Toast } from '../../components/ui/Toast.js';

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format (E.164)'),
  weightKg: z.coerce.number().min(45, 'Weight must be at least 45 kg').max(300)
});

type ProfileUpdateData = z.infer<typeof profileUpdateSchema>;

export interface DonorProfileCardProps {
  profile: DonorProfile;
  onProfileUpdated: (updated: DonorProfile) => void;
}

export function DonorProfileCard({ profile, onProfileUpdated }: DonorProfileCardProps): React.ReactElement {
  const [successToast, setSuccessToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ProfileUpdateData>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      fullName: profile.fullName,
      phone: profile.phone,
      weightKg: profile.weightKg
    }
  });

  const onSubmit = async (data: ProfileUpdateData) => {
    setErrorMessage(null);
    try {
      const updated = await apiFetch<DonorProfile>('/api/v1/donors/me', {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
      onProfileUpdated(updated);
      setSuccessToast(true);
    } catch {
      setErrorMessage('Failed to update profile. Please try again.');
    }
  };

  return (
    <Card className="relative">
      {successToast && (
        <div className="absolute top-4 right-4 z-20">
          <Toast
            title="Profile Updated"
            description="Your donor profile details have been saved."
            variant="info"
            onDismiss={() => setSuccessToast(false)}
          />
        </div>
      )}

      <CardHeader>
        <Eyebrow variant="breeze" size="sm">
          VOLUNTEER IDENTITY
        </Eyebrow>
        <CardTitle>Donor Medical & Contact Profile</CardTitle>
        <CardDescription>
          Deterministic matching relies on accurate weight and blood group data. Biological fields are immutable after verification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Static Immutable Clinical Facts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-canvas-subtle/10 border border-canvas-subtle/30 rounded-lg text-xs">
            <div>
              <span className="text-canvas-muted block uppercase tracking-wider font-mono text-[10px]">
                Blood Group
              </span>
              <span className="font-semibold text-canvas-fg text-base">{profile.bloodGroup}</span>
            </div>
            <div>
              <span className="text-canvas-muted block uppercase tracking-wider font-mono text-[10px]">
                Biological Sex
              </span>
              <span className="text-canvas-fg text-sm capitalize">{profile.sex}</span>
            </div>
            <div>
              <span className="text-canvas-muted block uppercase tracking-wider font-mono text-[10px]">
                Date of Birth
              </span>
              <span className="text-canvas-fg text-sm">{profile.dateOfBirth}</span>
            </div>
          </div>

          <TextInput
            label="Full Legal Name"
            autoComplete="name"
            error={errors.fullName?.message}
            required
            {...register('fullName')}
          />

          <TextInput
            label="Contact Phone Number (E.164)"
            type="tel"
            autoComplete="tel"
            error={errors.phone?.message}
            required
            {...register('phone')}
          />

          <TextInput
            label="Body Weight (kg)"
            type="number"
            error={errors.weightKg?.message}
            required
            {...register('weightKg')}
          />

          {errorMessage && (
            <div
              role="alert"
              className="p-3 bg-sunset-edge/10 border border-sunset-edge/40 rounded-lg text-xs font-mono text-sunset-glow"
            >
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
