import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../app/AuthContext.js';
import { LoginPage } from '../LoginPage.js';
import { DonorRegisterPage } from '../DonorRegisterPage.js';
import { HospitalRegisterPage } from '../HospitalRegisterPage.js';
import { BloodBankRegisterPage } from '../BloodBankRegisterPage.js';

describe('Auth Screens & Form UX Validation', () => {
  it('validates login form requiring email format and password', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    const submitBtn = screen.getByRole('button', { name: /sign in to session/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/email address is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('displays generic error on invalid login credentials without user enumeration', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'invalid@example.com');
    await user.type(passwordInput, 'wrongpassword');

    const submitBtn = screen.getByRole('button', { name: /sign in to session/i });
    await user.click(submitBtn);

    expect(
      await screen.findByText(/invalid email or password\. please verify your credentials/i)
    ).toBeInTheDocument();
  });

  it('validates donor registration enforcing min 12 character password and min 45kg weight', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register/donor']}>
        <AuthProvider>
          <DonorRegisterPage />
        </AuthProvider>
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password \(min 12 chars\)/i);
    const weightInput = screen.getByLabelText(/weight \(kg, min 45\)/i);
    const phoneInput = screen.getByLabelText(/phone number/i);

    await user.type(nameInput, 'A');
    await user.type(emailInput, 'notanemail');
    await user.type(passwordInput, 'short');
    await user.clear(weightInput);
    await user.type(weightInput, '40');
    await user.type(phoneInput, '1234');

    const submitBtn = screen.getByRole('button', { name: /complete donor registration/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/full name must be at least 2 characters/i)).toBeInTheDocument();
    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/password must be at least 12 characters/i)).toBeInTheDocument();
    expect(await screen.findByText(/weight must be at least 45 kg/i)).toBeInTheDocument();
    expect(await screen.findByText(/invalid phone number/i)).toBeInTheDocument();
  });

  it('registers hospital and displays pending admin approval notice', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register/hospital']}>
        <AuthProvider>
          <HospitalRegisterPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/hospital name/i), 'City Care Hospital');
    await user.type(screen.getByLabelText(/clinical registration no/i), 'HOSP-2026-999');
    await user.type(screen.getByLabelText(/official contact email/i), 'contact@citycare.org');
    await user.type(screen.getByLabelText(/password \(min 12 chars\)/i), 'SecurePassphrase123#');
    await user.type(screen.getByLabelText(/emergency contact phone/i), '+911122334455');
    await user.type(screen.getByLabelText(/facility physical address/i), 'Sector 14, Main Road, New Delhi 110001');

    const submitBtn = screen.getByRole('button', { name: /submit hospital for verification/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/hospital account pending verification/i)).toBeInTheDocument();
    expect(screen.getByText(/STATUS: PENDING ADMIN APPROVAL/i)).toBeInTheDocument();
  });

  it('registers blood bank and displays pending license verification state', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/register/blood-bank']}>
        <AuthProvider>
          <BloodBankRegisterPage />
        </AuthProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/facility name/i), 'Red Cross Transfusion Unit');
    await user.type(screen.getByLabelText(/drug control license number/i), 'DL-LIC-2026-004');
    await user.type(screen.getByLabelText(/official contact email/i), 'ops@redcross.org');
    await user.type(screen.getByLabelText(/password \(min 12 chars\)/i), 'PassphraseLongEnough123!');
    await user.type(screen.getByLabelText(/facility phone number/i), '+911144556677');
    await user.type(screen.getByLabelText(/physical facility address/i), 'Red Cross Bhavan, Golf Links, New Delhi');

    const submitBtn = screen.getByRole('button', { name: /submit blood bank for verification/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/blood bank account pending approval/i)).toBeInTheDocument();
  });
});
