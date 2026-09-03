import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import AttendanceTracking from '../AttendanceTracking';
import * as useAttendanceHooks from '@/hooks/useAttendance';
import * as useStudentsHooks from '@/hooks/useStudents';

// Mock the hooks
vi.mock('@/hooks/useAttendance');
vi.mock('@/hooks/useStudents');

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

    // Default mock implementations
    vi.mocked(useStudentsHooks.useStudentAutocomplete).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
  });

  it('should render the attendance tracking form', () => {
    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    render(<AttendanceTracking classId={mockClassId} />);

    expect(screen.getByText('Kirjaa opiskelijan läsnäolo')).toBeInTheDocument();
    expect(screen.getByLabelText('Opiskelijan nimi')).toBeInTheDocument();
    expect(screen.getByLabelText('Määrä')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kirjaa läsnäolo/i })).toBeInTheDocument();
  });

  it('should have empty input fields initially', () => {
    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    render(<AttendanceTracking classId={mockClassId} />);

    const nameInput = screen.getByLabelText('Opiskelijan nimi') as HTMLInputElement;
    const quantityInput = screen.getByLabelText('Määrä') as HTMLInputElement;

    expect(nameInput.value).toBe('');
    expect(quantityInput.value).toBe('1');
  });

  it('should update input values when typing', async () => {
    const user = userEvent.setup();

    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    render(<AttendanceTracking classId={mockClassId} />);

    const nameInput = screen.getByLabelText('Opiskelijan nimi');
    const quantityInput = screen.getByLabelText('Määrä') as HTMLInputElement;

    await user.type(nameInput, 'John Doe');

    // Select all and replace to avoid appending
    await user.tripleClick(quantityInput);
    await user.keyboard('5');

    expect(nameInput).toHaveValue('John Doe');
    expect(quantityInput).toHaveValue(5);
  });

  it('should show autocomplete suggestions', async () => {
    const user = userEvent.setup();
    const mockSuggestions = [
      { id: '1', name: 'John Doe', total_attendance: 5 },
      { id: '2', name: 'Jane Doe', total_attendance: 3 },
    ];

    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    // Start with no suggestions, then add them when typing
    const mockAutocompleteHook = vi.mocked(useStudentsHooks.useStudentAutocomplete);
    mockAutocompleteHook.mockReturnValue({
      data: [],
    } as any);

    const { rerender } = render(<AttendanceTracking classId={mockClassId} />);

    const nameInput = screen.getByLabelText('Opiskelijan nimi');

    // Type to trigger autocomplete
    await user.type(nameInput, 'Joh');

    // Update mock to return suggestions
    mockAutocompleteHook.mockReturnValue({
      data: mockSuggestions,
    } as any);

    // Rerender to reflect the new data
    rerender(<AttendanceTracking classId={mockClassId} />);

    // Wait for suggestions to appear
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('5 läsnäoloa')).toBeInTheDocument();
    });
  });

  it('should call createAttendance when form is submitted with valid data', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn().mockResolvedValue({
      id: 'record-123',
      class_id: mockClassId,
      student_name: 'John Doe',
      total_attendance: 6,
      quantity_created: 1,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    } as any);

    render(<AttendanceTracking classId={mockClassId} />);

    const nameInput = screen.getByLabelText('Opiskelijan nimi');
    const submitButton = screen.getByRole('button', { name: /kirjaa läsnäolo/i });

    await user.type(nameInput, 'John Doe');
    await user.click(submitButton);

    // Wait for the mock to be called
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
    }, { timeout: 3000 });

    expect(mockMutate).toHaveBeenCalledWith({
      classId: mockClassId,
      data: {
        student_name: 'John Doe',
        quantity: 1,
        timestamp: expect.any(String),
      },
    });

    // Asserting the day, not the instant: the component stamps the current time.
    const [{ data }] = mockMutate.mock.calls[0];
    expect(new Date(data.timestamp).toDateString()).toBe(new Date().toDateString());
  });

  it('should support bulk logging with quantity', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn().mockResolvedValue({
      id: 'record-123',
      class_id: mockClassId,
      student_name: 'John Doe',
      total_attendance: 10,
      quantity_created: 5,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    } as any);

    render(<AttendanceTracking classId={mockClassId} />);

    const nameInput = screen.getByLabelText('Opiskelijan nimi');
    const quantityInput = screen.getByLabelText('Määrä') as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /kirjaa läsnäolo/i });

    await user.type(nameInput, 'John Doe');

    // Select all and replace to avoid appending
    await user.tripleClick(quantityInput);
    await user.keyboard('5');

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
    }, { timeout: 3000 });

    expect(mockMutate).toHaveBeenCalledWith({
      classId: mockClassId,
      data: {
        student_name: 'John Doe',
        quantity: 5,
        timestamp: expect.any(String),
      },
    });

    // Asserting the day, not the instant: the component stamps the current time.
    const [{ data }] = mockMutate.mock.calls[0];
    expect(new Date(data.timestamp).toDateString()).toBe(new Date().toDateString());
  });

  it('should clear input fields after successful submission', async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn().mockResolvedValue({
      id: 'record-123',
      class_id: mockClassId,
      student_name: 'John Doe',
      total_attendance: 6,
      quantity_created: 1,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    } as any);

    render(<AttendanceTracking classId={mockClassId} />);

    const nameInput = screen.getByLabelText('Opiskelijan nimi');
    const quantityInput = screen.getByLabelText('Määrä');
    const submitButton = screen.getByRole('button', { name: /kirjaa läsnäolo/i });

    await user.type(nameInput, 'John Doe');
    await user.clear(quantityInput);
    await user.type(quantityInput, '3');
    await user.click(submitButton);

    // First wait for mutation to complete
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled();
    }, { timeout: 3000 });

    // Then wait for fields to clear
    await waitFor(() => {
      expect(nameInput).toHaveValue('');
      expect(quantityInput).toHaveValue(1);
    }, { timeout: 3000 });
  });

  it('should display help text about usage', () => {
    vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any);

    render(<AttendanceTracking classId={mockClassId} />);

    expect(
      screen.getByText(/Ala kirjoittaa opiskelijan nimeä nähdäksesi ehdotuksia/i)
    ).toBeInTheDocument();
  });
});
