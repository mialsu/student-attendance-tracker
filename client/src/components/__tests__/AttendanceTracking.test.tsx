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

  // AC4 / US-13, US-14. Before this block the list was mouse-only: measured on 2026-09-11, two
  // ArrowDown presses left the active option at index 0, focus never left the input, Enter did
  // not accept the highlighted row, and the input carried no combobox semantics at all. The
  // walk's "with no mouse" test passed anyway because it types the whole name and dismisses the
  // list with Escape, which is the one keyboard path that did work.
  describe('the suggestion list, driven from the keyboard', () => {
    const SUGGESTIONS = [
      { id: 's1', name: 'Väinö Nieminen', total_attendance: 7 },
      { id: 's2', name: 'Väinö Virtanen', total_attendance: 4 },
      { id: 's3', name: 'Väinämö Koskinen', total_attendance: 1 },
    ];

    // `as unknown as` rather than the `as any` the tests above use: the lint gate is a ratchet,
    // and four more `no-explicit-any` errors would have raised its baseline (`setup.ts:65` is the
    // existing precedent for this shape).
    type AutocompleteResult = ReturnType<typeof useStudentsHooks.useStudentAutocomplete>;
    type CreateResult = ReturnType<typeof useAttendanceHooks.useCreateAttendance>;

    const withSuggestions = (data: typeof SUGGESTIONS) =>
      vi.mocked(useStudentsHooks.useStudentAutocomplete).mockReturnValue({
        data,
        isLoading: false,
        error: null,
      } as unknown as AutocompleteResult);

    const withMutation = (mutateAsync = vi.fn()) => {
      vi.mocked(useAttendanceHooks.useCreateAttendance).mockReturnValue({
        mutateAsync,
        isPending: false,
      } as unknown as CreateResult);
      return mutateAsync;
    };

    const open = async (data: typeof SUGGESTIONS = SUGGESTIONS) => {
      withMutation();
      withSuggestions(data);

      const user = userEvent.setup();
      render(<AttendanceTracking classId={mockClassId} />);
      const name = screen.getByLabelText('Opiskelijan nimi');
      await user.type(name, 'Vä');
      if (data.length > 0) {
        await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(data.length));
      }
      return { user, name };
    };

    const activeOptionName = (name: HTMLElement) => {
      const id = name.getAttribute('aria-activedescendant');
      return id ? document.getElementById(id)?.textContent ?? null : null;
    };

    it('presents the field as a combobox owning a listbox', async () => {
      const { name } = await open();

      expect(name).toHaveAttribute('role', 'combobox');
      expect(name).toHaveAttribute('aria-expanded', 'true');
      expect(name).toHaveAttribute('aria-autocomplete', 'list');

      const listId = name.getAttribute('aria-controls');
      expect(listId).toBeTruthy();
      expect(document.getElementById(listId!)).toHaveAttribute('role', 'listbox');
    });

    it('nominates no option until a key asks for one', async () => {
      const { name } = await open();
      expect(name).not.toHaveAttribute('aria-activedescendant');
    });

    it('moves the active option down and up, and wraps at both ends', async () => {
      const { user, name } = await open();

      await user.keyboard('{ArrowDown}');
      expect(activeOptionName(name)).toContain('Väinö Nieminen');

      await user.keyboard('{ArrowDown}');
      expect(activeOptionName(name)).toContain('Väinö Virtanen');

      await user.keyboard('{ArrowUp}');
      expect(activeOptionName(name)).toContain('Väinö Nieminen');

      // Up from the first wraps to the last, down from the last back to the first.
      await user.keyboard('{ArrowUp}');
      expect(activeOptionName(name)).toContain('Väinämö Koskinen');
      await user.keyboard('{ArrowDown}');
      expect(activeOptionName(name)).toContain('Väinö Nieminen');
    });

    it('marks exactly one option selected as it moves', async () => {
      const { user, name } = await open();
      await user.keyboard('{ArrowDown}{ArrowDown}');

      const selected = screen
        .getAllByRole('option')
        .filter((option) => option.getAttribute('aria-selected') === 'true');

      expect(selected).toHaveLength(1);
      expect(selected[0].textContent).toContain('Väinö Virtanen');
      expect(activeOptionName(name)).toContain('Väinö Virtanen');
    });

    it('accepts the active option with Enter, and does not submit the form', async () => {
      const mutateAsync = withMutation();
      withSuggestions(SUGGESTIONS);

      const user = userEvent.setup();
      render(<AttendanceTracking classId={mockClassId} />);
      const name = screen.getByLabelText('Opiskelijan nimi') as HTMLInputElement;
      await user.type(name, 'Vä');
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));

      await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

      expect(name.value).toBe('Väinö Virtanen');
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(name).toHaveAttribute('aria-expanded', 'false');
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('closes the list on Escape and leaves the typed text alone', async () => {
      const { user, name } = await open();

      await user.keyboard('{Escape}');

      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(name).toHaveAttribute('aria-expanded', 'false');
      expect((name as HTMLInputElement).value).toBe('Vä');
    });

    // The handoff's recurring defect: accessible-name computation joins descendant text with no
    // separator, so a row carrying a name and a tally announces as "Väinö Nieminen7 läsnäoloa".
    // The visible name stays the leading substring of the accessible one (WCAG 2.5.3).
    it('names each option so the tally does not run into the name', async () => {
      await open();

      expect(
        screen.getByRole('option', { name: 'Väinö Nieminen, 7 läsnäoloa' })
      ).toBeInTheDocument();
    });

    // US-14. "Ei ehdotuksia" said only that the list was empty; it never told her that
    // submitting would create someone.
    it('says a new student will be created when nothing matches', async () => {
      await open([]);

      // The claim waits for the 300ms debounce to catch up with the field, so that it is never
      // made about a stale or in-flight result.
      await waitFor(() =>
        expect(screen.getByText(/luodaan uusi opiskelija/i)).toBeInTheDocument()
      );
    });
  });
});
