import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// --- No test may reach the network ------------------------------------------------------------
//
// CODING_STANDARDS.md carried this as a `[review-only]` rule, and a whole suite had already
// broken it: src/contexts/__tests__/AuthContext.test.tsx mocked nothing, so every run really
// posted to http://localhost:8000 and failed with ERR_NETWORK. A rule that only lives in prose
// gets violated by 19 tests at a time, so this is the enforcer.
//
// Refusing the call is not enough on its own — axios turns a synchronous adapter throw into a
// rejected promise, which a test asserting `.rejects` would swallow. So each attempt is also
// recorded and re-thrown after the test, where nothing can catch it.
const networkAttempts: string[] = [];

const refuse = (how: string, target: string): never => {
  const attempt = `${how} ${target}`;
  networkAttempts.push(attempt);
  throw new Error(
    `A test tried to reach the network (${attempt}). Mock at the src/api seam instead — ` +
      'see TESTING.md, "Mocking Functions".',
  );
};

class RefusingXMLHttpRequest {
  // axios reads and assigns these around open(); they have to exist for the throw to be the
  // first thing that happens rather than a confusing TypeError.
  readyState = 0;
  status = 0;
  statusText = '';
  response = null;
  responseText = '';
  responseType = '';
  timeout = 0;
  withCredentials = false;
  upload = {};

  open(method: string, url: string): never {
    return refuse(method.toUpperCase(), url);
  }

  send(): void {}
  abort(): void {}
  setRequestHeader(): void {}
  getAllResponseHeaders(): string {
    return '';
  }
  getResponseHeader(): null {
    return null;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  overrideMimeType(): void {}
  dispatchEvent(): boolean {
    return false;
  }
}

global.XMLHttpRequest = RefusingXMLHttpRequest as unknown as typeof XMLHttpRequest;
global.fetch = ((input: RequestInfo | URL): never =>
  refuse('fetch', String(input instanceof Request ? input.url : input))) as typeof fetch;

afterEach(() => {
  if (networkAttempts.length === 0) return;
  const attempts = networkAttempts.join('\n  ');
  networkAttempts.length = 0;
  throw new Error(
    `This test reached for the network, which no test may do:\n  ${attempts}\n` +
      'Mock at the src/api seam — see TESTING.md, "Mocking Functions".',
  );
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

beforeEach(() => {
  // Clear localStorage before each test
  localStorageMock.clear();
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock ResizeObserver (needed for cmdk/Command component)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock scrollIntoView (needed for cmdk/Command component)
Element.prototype.scrollIntoView = function() {};
