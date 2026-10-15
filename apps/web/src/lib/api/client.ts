import { getAccessToken, setAccessToken, clearAccessToken } from './token-store.js';
import { ApiError, type UniformApiErrorPayload } from './errors.js';

export interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean;
  skipAutoRefresh?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

export function isSameOrigin(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return true;
  }
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

async function requestSilentRefresh(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'raktsetu'
        }
      });

      if (!response.ok) {
        clearAccessToken();
        return null;
      }

      const data = (await response.json()) as { accessToken: string };
      if (data && typeof data.accessToken === 'string') {
        setAccessToken(data.accessToken);
        return data.accessToken;
      }

      clearAccessToken();
      return null;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const { skipAuth = false, skipAutoRefresh = false, ...fetchOptions } = options;
  const sameOrigin = isSameOrigin(endpoint);

  const headers = new Headers(fetchOptions.headers || {});

  // Add JSON content type if body is an object and not FormData
  if (
    fetchOptions.body &&
    typeof fetchOptions.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach in-memory access token if available
  const currentToken = getAccessToken();
  if (!skipAuth && currentToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentToken}`);
  }

  // Send credentials and CSRF header strictly to same-origin requests
  const credentials = sameOrigin ? fetchOptions.credentials || 'include' : 'omit';
  if (sameOrigin && !headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'raktsetu');
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...fetchOptions,
      headers,
      credentials
    });
  } catch (netErr) {
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: netErr instanceof Error ? netErr.message : 'Network connection failure',
      requestId: ''
    });
  }

  // Handle 401 with silent token refresh and single retry
  if (response.status === 401 && !skipAutoRefresh && sameOrigin) {
    const newToken = await requestSilentRefresh();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      const retryResponse = await fetch(endpoint, {
        ...fetchOptions,
        headers,
        credentials
      });

      if (!retryResponse.ok) {
        return handleFailedResponse<T>(retryResponse);
      }
      return parseJsonResponse<T>(retryResponse);
    }
  }

  if (!response.ok) {
    return handleFailedResponse<T>(response);
  }

  return parseJsonResponse<T>(response);
}

async function handleFailedResponse<T>(response: Response): Promise<T> {
  let errorPayload: UniformApiErrorPayload['error'];
  try {
    const parsed = (await response.json()) as UniformApiErrorPayload;
    if (parsed && parsed.error && typeof parsed.error.message === 'string') {
      errorPayload = parsed.error;
    } else {
      errorPayload = {
        code: `HTTP_${response.status}`,
        message: response.statusText || `Request failed with HTTP status ${response.status}`,
        requestId: response.headers.get('x-request-id') || ''
      };
    }
  } catch {
    errorPayload = {
      code: `HTTP_${response.status}`,
      message: response.statusText || `Request failed with HTTP status ${response.status}`,
      requestId: response.headers.get('x-request-id') || ''
    };
  }

  throw new ApiError(response.status, errorPayload);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown, options?: ApiFetchOptions) => {
    const fetchOpts: ApiFetchOptions = { ...options, method: 'POST' };
    if (body !== undefined) {
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return apiFetch<T>(endpoint, fetchOpts);
  },
  patch: <T>(endpoint: string, body?: unknown, options?: ApiFetchOptions) => {
    const fetchOpts: ApiFetchOptions = { ...options, method: 'PATCH' };
    if (body !== undefined) {
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return apiFetch<T>(endpoint, fetchOpts);
  },
  put: <T>(endpoint: string, body?: unknown, options?: ApiFetchOptions) => {
    const fetchOpts: ApiFetchOptions = { ...options, method: 'PUT' };
    if (body !== undefined) {
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return apiFetch<T>(endpoint, fetchOpts);
  },
  delete: <T>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' })
};

