import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import AttendanceTracking from '../AttendanceTracking';
import * as classesLib from '@/lib/classes';

// Mock the classes lib
vi.mock('@/lib/classes', () => ({
  logClassAttendance: vi.fn(),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('AttendanceTracking Component', () => {
  const mockClassId = 'test-class-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the attendance tracking form', () => {
    render(<AttendanceTracking classId={mockClassId} />);

    expect(screen.getByText('Kirjaa opiskelijan läsnäolo')).toBeInTheDocument();
    expect(screen.getByLabelText('Etunimi')).toBeInTheDocument();
    expect(screen.getByLabelText('Sukunimi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kirjaa läsnäolo/i })).toBeInTheDocument();
  });

  it('should have empty input fields initially', () => {
    render(<AttendanceTracking classId={mockClassId} />);

    const firstNameInput = screen.getByLabelText('Etunimi') as HTMLInputElement;
    const lastNameInput = screen.getByLabelText('Sukunimi') as HTMLInputElement;

    expect(firstNameInput.value).toBe('');
    expect(lastNameInput.value).toBe('');
  });

  it('should update input values when typing', async () => {
    const user = userEvent.setup();
    render(<AttendanceTracking classId={mockClassId} />);

    const firstNameInput = screen.getByLabelText('Etunimi');
    const lastNameInput = screen.getByLabelText('Sukunimi');

    await user.type(firstNameInput, 'John');
    await user.type(lastNameInput, 'Doe');

    expect(firstNameInput).toHaveValue('John');
    expect(lastNameInput).toHaveValue('Doe');
  });

  it('should call logClassAttendance when form is submitted with valid data', async () => {
    const user = userEvent.setup();
    const mockLogAttendance = vi.mocked(classesLib.logClassAttendance);
    mockLogAttendance.mockReturnValue({
      id: 'record-123',
      classId: mockClassId,
      studentFirstName: 'John',
      studentLastName: 'Doe',
      timestamp: new Date().toISOString(),
    });

    render(<AttendanceTracking classId={mockClassId} />);

    const firstNameInput = screen.getByLabelText('Etunimi');
    const lastNameInput = screen.getByLabelText('Sukunimi');
    const submitButton = screen.getByRole('button', { name: /kirjaa läsnäolo/i });

    await user.type(firstNameInput, 'John');
    await user.type(lastNameInput, 'Doe');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogAttendance).toHaveBeenCalledWith(mockClassId, 'John', 'Doe');
    });
  });

  it('should clear input fields after successful submission', async () => {
    const user = userEvent.setup();
    const mockLogAttendance = vi.mocked(classesLib.logClassAttendance);
    mockLogAttendance.mockReturnValue({
      id: 'record-123',
      classId: mockClassId,
      studentFirstName: 'John',
      studentLastName: 'Doe',
      timestamp: new Date().toISOString(),
    });

    render(<AttendanceTracking classId={mockClassId} />);

    const firstNameInput = screen.getByLabelText('Etunimi');
    const lastNameInput = screen.getByLabelText('Sukunimi');
    const submitButton = screen.getByRole('button', { name: /kirjaa läsnäolo/i });

    await user.type(firstNameInput, 'John');
    await user.type(lastNameInput, 'Doe');
    await user.click(submitButton);

    await waitFor(() => {
      expect(firstNameInput).toHaveValue('');
      expect(lastNameInput).toHaveValue('');
    });
  });

  it('should display help text about usage', () => {
    render(<AttendanceTracking classId={mockClassId} />);

    expect(
      screen.getByText(/Syötä opiskelijan etu- ja sukunimi ja paina/i)
    ).toBeInTheDocument();
  });
});
