import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../../app/AuthContext.js';
import { NotificationInbox } from '../NotificationInbox.js';

describe('Notification Inbox & Web Push Opt-In Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Notification API
    Object.defineProperty(global, 'Notification', {
      writable: true,
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted')
      }
    });

    // Mock ServiceWorker API
    Object.defineProperty(global.navigator, 'serviceWorker', {
      writable: true,
      value: {
        register: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockResolvedValue({
              endpoint: 'https://push.example.com/sub-1',
              getKey: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4]))
            })
          }
        }),
        ready: Promise.resolve()
      }
    });

    Object.defineProperty(global, 'PushManager', {
      writable: true,
      value: class PushManager {}
    });
  });

  it('renders incoming notifications with urgent badge and distance band', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationInbox />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/emergency o\+ blood request/i)).toBeInTheDocument();
    expect(screen.getByText('CRITICAL NEED')).toBeInTheDocument();
    expect(screen.getByText(/approx\. ~3\.2 km away/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark read/i })).toBeInTheDocument();
  });

  it('marks an unread notification as read on button click', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationInbox />
        </AuthProvider>
      </MemoryRouter>
    );

    const markReadBtn = await screen.findByRole('button', { name: /mark read/i });
    await user.click(markReadBtn);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /mark read/i })).not.toBeInTheDocument();
    });
  });

  it('triggers Web Push registration and submits subscription payload to API', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationInbox />
        </AuthProvider>
      </MemoryRouter>
    );

    const enablePushBtn = await screen.findByRole('button', { name: /enable web push/i });
    await user.click(enablePushBtn);

    expect(global.Notification.requestPermission).toHaveBeenCalled();
    expect(global.navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    expect(
      await screen.findByText(/web push notifications enabled for emergency alerts/i)
    ).toBeInTheDocument();
  });
});
