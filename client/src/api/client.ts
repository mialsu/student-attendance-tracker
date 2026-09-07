import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT) || 30000;

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // For HTTP-only cookies (refresh token)
});

/**
 * Endpoints whose 401 means *the credentials you just typed are wrong*, not *your access token
 * expired*.
 *
 * The response interceptor below answers a 401 by refreshing the token and replaying the request,
 * and on a failed refresh it clears the token and hard-navigates to `/auth`. For a stale token
 * that is the whole point. For these four it destroys the toast that was about to name the
 * problem, so a mistyped password shows the teacher a blink and nothing else — and because the
 * reload lands on a directly-loaded `/auth`, the next attempt used to hang on the session spinner
 * too. The Playwright walk found it on 2026-09-07.
 *
 * Each of the four returns 401 from the API for a bad credential rather than a bad token:
 * `/login` (auth_service.py:63,69), `/refresh` (api/auth.py:141-163), and `/email` and
 * `/password`, which both verify the current password (auth_service.py:164,205). `/api/auth/me` is
 * deliberately absent — that one *is* the stale-token case.
 */
const CREDENTIAL_CHECKS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/email',
  '/api/auth/password',
];

export const isCredentialCheck = (url: string | undefined): boolean =>
  // Strip the query without indexing a split: tsconfig.e2e.json type-checks this file under
  // noUncheckedIndexedAccess, where `split('?')[0]` is possibly undefined.
  url !== undefined && CREDENTIAL_CHECKS.some((path) => url.replace(/\?.*$/, '').endsWith(path));

// Token management (in-memory)
let accessToken: string | null = null;

export const setAccessToken = (token: string) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

export const clearTokens = () => {
  accessToken = null;
};

// Request interceptor to add access token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, try to refresh token — unless the 401 came from an
    // endpoint that was checking typed credentials, where refreshing is both pointless and
    // destructive. See CREDENTIAL_CHECKS above.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isCredentialCheck(originalRequest?.url)
    ) {
      originalRequest._retry = true;

      try {
        const { data } = await axios.post(
          `${API_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );

        setAccessToken(data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;

        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        clearTokens();
        window.location.href = '/auth';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
