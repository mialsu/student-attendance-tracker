# Testing Guide

## Overview

This project follows **Test-Driven Development (TDD)** principles using Vitest and React Testing Library. We maintain comprehensive test coverage across unit, component, and integration tests.

## Testing Stack

- **Vitest** - Fast unit test framework (Vite-native)
- **React Testing Library** - Component testing utilities
- **Testing Library User Event** - Simulating user interactions
- **jsdom** - DOM implementation for Node.js
- **@testing-library/jest-dom** - Custom matchers

## Running Tests

```bash
# Run tests in watch mode (for development)
npm test

# Run tests once (for CI/CD)
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

### Directory Organization

```
src/
├── lib/
│   ├── classes.ts
│   └── __tests__/
│       └── classes.test.ts          # Unit tests for business logic
├── components/
│   ├── AttendanceTracking.tsx
│   └── __tests__/
│       └── AttendanceTracking.test.tsx  # Component tests
├── __tests__/
│   └── integration/
│       └── auth-flow.test.tsx       # Integration tests
└── test/
    ├── setup.ts                     # Test setup and global mocks
    └── test-utils.tsx               # Custom render with providers
```

## Test-Driven Development (TDD) Workflow

### The Red-Green-Refactor Cycle

1. **RED**: Write a failing test first
2. **GREEN**: Write minimum code to make the test pass
3. **REFACTOR**: Improve code while keeping tests green

### Example TDD Workflow

```typescript
// 1. RED - Write the test first (it will fail)
describe('createClass', () => {
  it('should create a new class with correct properties', () => {
    const newClass = createClass('Math', 'Math 101', 'teacher@test.com');

    expect(newClass).toMatchObject({
      name: 'Math',
      description: 'Math 101',
      teacherEmail: 'teacher@test.com',
    });
    expect(newClass.id).toBeDefined();
  });
});

// 2. GREEN - Implement the function
export const createClass = (name: string, description: string, teacherEmail: string) => {
  return {
    id: crypto.randomUUID(),
    name,
    description,
    teacherEmail,
    createdAt: new Date().toISOString(),
  };
};

// 3. REFACTOR - Improve the code
export const createClass = (name: string, description: string, teacherEmail: string): Class => {
  const classes = getClasses();
  const newClass: Class = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description.trim(),
    teacherEmail,
    createdAt: new Date().toISOString(),
  };
  classes.push(newClass);
  localStorage.setItem('classes', JSON.stringify(classes));
  return newClass;
};
```

## Testing Guidelines

### 1. Unit Tests (lib/__tests__)

Test business logic in isolation. Focus on:
- Input/output validation
- Edge cases
- Error handling
- Data transformations

```typescript
describe('getClassesByTeacher', () => {
  it('should return only classes for specified teacher', () => {
    createClass('Math', 'Desc', 'teacher1@test.com');
    createClass('Physics', 'Desc', 'teacher2@test.com');

    const classes = getClassesByTeacher('teacher1@test.com');

    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('Math');
  });
});
```

### 2. Component Tests (components/__tests__)

Test component rendering and user interactions. Focus on:
- Component renders correctly
- User interactions work
- Props are handled properly
- Conditional rendering

```typescript
describe('AttendanceTracking', () => {
  it('should call logClassAttendance when form is submitted', async () => {
    const user = userEvent.setup();
    render(<AttendanceTracking classId="test-123" />);

    await user.type(screen.getByLabelText('Etunimi'), 'John');
    await user.type(screen.getByLabelText('Sukunimi'), 'Doe');
    await user.click(screen.getByRole('button', { name: /kirjaa/i }));

    expect(mockLogAttendance).toHaveBeenCalledWith('test-123', 'John', 'Doe');
  });
});
```

### 3. Integration Tests (__tests__/integration/)

Test complete user flows. Focus on:
- Multi-step user journeys
- Component interactions
- State management across components
- Routing

```typescript
describe('Authentication Flow', () => {
  it('should allow user to sign up and log in', async () => {
    const user = userEvent.setup();
    render(<Auth />);

    // Sign up
    await user.click(screen.getByRole('button', { name: /rekisteröidy/i }));
    await user.type(screen.getByLabelText('Sähköposti'), 'test@test.com');
    await user.type(screen.getByLabelText('Salasana'), 'password123');
    await user.click(screen.getByRole('button', { name: /rekisteröidy/i }));

    // Verify user created
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    expect(users).toHaveLength(1);
  });
});
```

## Best Practices

### DO ✅

- **Write tests before code** (TDD approach)
- **Test behavior, not implementation** - Focus on what users see and do
- **Use descriptive test names** - "should allow teacher to create a class"
- **Test edge cases** - Empty strings, null values, boundary conditions
- **Keep tests isolated** - Each test should be independent
- **Use `beforeEach` for setup** - Clear localStorage, reset mocks
- **Mock external dependencies** - API calls, localStorage, third-party libs

### DON'T ❌

- **Don't test implementation details** - Avoid testing internal state
- **Don't test library code** - Trust that React, date-fns work correctly
- **Don't write tests after the fact** - Follow TDD from the start
- **Don't have tests depend on each other** - Each test should run independently
- **Don't mock everything** - Only mock what's necessary

## Coverage Goals

Aim for:
- **80%+ overall coverage**
- **100% coverage for business logic** (lib/)
- **90%+ for components**
- **Critical user flows** fully tested

Check coverage with:
```bash
npm run test:coverage
```

## Common Testing Patterns

### Testing with LocalStorage

```typescript
beforeEach(() => {
  localStorage.clear();
});

it('should persist data to localStorage', () => {
  createClass('Math', 'Desc', 'teacher@test.com');

  const stored = JSON.parse(localStorage.getItem('classes') || '[]');
  expect(stored).toHaveLength(1);
});
```

### Testing Async Operations

```typescript
it('should update state after async operation', async () => {
  const user = userEvent.setup();
  render(<MyComponent />);

  await user.click(screen.getByRole('button'));

  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
```

### Testing User Interactions

```typescript
it('should handle form submission', async () => {
  const user = userEvent.setup();
  render(<MyForm />);

  await user.type(screen.getByLabelText('Name'), 'John');
  await user.click(screen.getByRole('button', { name: /submit/i }));

  expect(mockSubmit).toHaveBeenCalledWith({ name: 'John' });
});
```

### Mocking Functions

`src/api` is the seam this project mocks: the access token lives in memory inside it and the
refresh token is an HttpOnly cookie, so neither is reachable from a test. Mocking here is also
what keeps the suite off the network.

```typescript
import { vi } from 'vitest';

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

import { authApi } from '@/api/auth';

it('holds the user the API returned', async () => {
  vi.mocked(authApi.login).mockResolvedValue({
    access_token: 'an-access-token',
    token_type: 'bearer',
    user: { id: 'u1', email: 'teacher@example.com', active: true, created_at: '2026-09-02T00:00:00Z' },
  });

  // ... test code

  expect(authApi.login).toHaveBeenCalledWith({
    email: 'teacher@example.com',
    password: 'password123',
  });
});
```

## Debugging Tests

### Run Single Test File
```bash
npm test classes.test
```

### Run Tests in UI Mode
```bash
npm run test:ui
```

### Use `screen.debug()`
```typescript
it('should render something', () => {
  render(<MyComponent />);
  screen.debug(); // Prints DOM to console
});
```

### Use `only` and `skip`
```typescript
it.only('should test this one', () => {
  // Only this test runs
});

it.skip('should skip this', () => {
  // This test is skipped
});
```

## Continuous Integration

Tests should run in CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm run test:run

- name: Check coverage
  run: npm run test:coverage
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [TDD Guide](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

## Getting Help

If you're unsure how to test something:
1. Check existing tests for similar patterns
2. Refer to this documentation
3. Ask the team in code review
4. Consult Testing Library documentation
