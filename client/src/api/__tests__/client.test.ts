import { describe, it, expect } from 'vitest';
import { isCredentialCheck } from '../client';

/**
 * The response interceptor answers a 401 by refreshing the access token and replaying the request,
 * and when the refresh fails it clears the token and hard-navigates to `/auth`. That is right for
 * a stale token and wrong for every endpoint whose 401 means *the credentials you just typed are
 * wrong* — there the reload destroys the toast that was about to say so, and the teacher sees the
 * page blink and no message at all.
 *
 * The Playwright walk found it on 2026-09-07 against the login form; the API's own code shows the
 * same 401 on two more routes (`api/app/services/auth_service.py:164,205`), so `/settings` had it
 * twice over. This is the rule that decides, kept pure so it can be read and tested without a
 * network the suite forbids anyway.
 */
describe('isCredentialCheck', () => {
  it('is true for a refused login — the password was wrong, not the token', () => {
    expect(isCredentialCheck('/api/auth/login')).toBe(true);
  });

  it('is true for a refused refresh, so a dead cookie does not ask for a second one', () => {
    expect(isCredentialCheck('/api/auth/refresh')).toBe(true);
  });

  it('is true for the two /settings writes that verify the current password', () => {
    // api/app/services/auth_service.py:164 "Invalid password" (email change),
    // :205 "Invalid current password" (password change). Both AuthenticationError, both 401.
    expect(isCredentialCheck('/api/auth/email')).toBe(true);
    expect(isCredentialCheck('/api/auth/password')).toBe(true);
  });

  it('is false for /me, which is the stale-token case the retry exists for', () => {
    expect(isCredentialCheck('/api/auth/me')).toBe(false);
  });

  it('is false for the reads a teacher does all day', () => {
    expect(isCredentialCheck('/api/classes')).toBe(false);
    expect(isCredentialCheck('/api/classes/abc/attendance/summary')).toBe(false);
    expect(isCredentialCheck('/api/students/abc')).toBe(false);
  });

  it('ignores a query string, because axios keeps params separate but not always', () => {
    expect(isCredentialCheck('/api/auth/login?next=%2Fdashboard')).toBe(true);
    expect(isCredentialCheck('/api/classes?skip=0&limit=100')).toBe(false);
  });

  it('holds for an absolute URL, since baseURL is configurable', () => {
    expect(isCredentialCheck('https://attendance-api.kotoio.fi/api/auth/login')).toBe(true);
    expect(isCredentialCheck('https://attendance-api.kotoio.fi/api/auth/me')).toBe(false);
  });

  it('is false for nothing at all, so a config without a url takes the old path', () => {
    expect(isCredentialCheck(undefined)).toBe(false);
  });
});
