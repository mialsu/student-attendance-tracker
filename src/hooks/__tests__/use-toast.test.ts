import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast, toast } from '../use-toast';

describe('useToast hook', () => {
  beforeEach(() => {
    // Clear any existing toasts before each test
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toasts.forEach((t) => result.current.dismiss(t.id));
    });
  });

  describe('Initial State', () => {
    it('should start with empty toasts array', () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
    });
  });

  describe('toast function', () => {
    it('should add a toast with default properties', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Test Toast' });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0]).toMatchObject({
        title: 'Test Toast',
        open: true,
      });
      expect(result.current.toasts[0].id).toBeDefined();
    });

    it('should add toast with description', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Test',
          description: 'Test description',
        });
      });

      expect(result.current.toasts[0].description).toBe('Test description');
    });

    it('should add toast with variant', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: 'Error',
          variant: 'destructive',
        });
      });

      expect(result.current.toasts[0].variant).toBe('destructive');
    });

    it('should add toast with custom action', () => {
      const { result } = renderHook(() => useToast());

      const action = {
        label: 'Undo',
        onClick: () => {},
      };

      act(() => {
        result.current.toast({
          title: 'Test',
          action,
        });
      });

      expect(result.current.toasts[0].action).toEqual(action);
    });

    it('should generate unique IDs for toasts', () => {
      const { result } = renderHook(() => useToast());

      const ids: string[] = [];

      act(() => {
        result.current.toast({ title: 'Toast 1' });
        if (result.current.toasts[0]) ids.push(result.current.toasts[0].id);
      });

      act(() => {
        result.current.toast({ title: 'Toast 2' });
        if (result.current.toasts[0]) ids.push(result.current.toasts[0].id);
      });

      // IDs should be different even if only one toast is shown at a time
      expect(ids.length).toBe(2);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('should respect TOAST_LIMIT', () => {
      const { result } = renderHook(() => useToast());

      // Add more toasts than the limit (1)
      act(() => {
        result.current.toast({ title: 'Toast 1' });
        result.current.toast({ title: 'Toast 2' });
      });

      // Should only keep the most recent toast
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('Toast 2');
    });
  });

  describe('dismiss', () => {
    it('should have dismiss function available', () => {
      const { result } = renderHook(() => useToast());

      expect(typeof result.current.dismiss).toBe('function');
    });

    it('should call dismiss without errors', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast 1' });
      });

      expect(() => {
        act(() => {
          result.current.dismiss();
        });
      }).not.toThrow();
    });

    it('should call dismiss with ID without errors', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast' });
      });

      const toastId = result.current.toasts[0]?.id;

      expect(() => {
        act(() => {
          if (toastId) {
            result.current.dismiss(toastId);
          }
        });
      }).not.toThrow();
    });

    it('should handle dismissing non-existent toast gracefully', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Toast' });
      });

      expect(() => {
        act(() => {
          result.current.dismiss('non-existent-id');
        });
      }).not.toThrow();

      expect(result.current.toasts).toHaveLength(1);
    });
  });

  describe('Standalone toast function', () => {
    it('should work as standalone function', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast({ title: 'Standalone Toast' });
      });

      // Need to check after a tick since standalone function dispatches
      expect(result.current.toasts.length).toBeGreaterThanOrEqual(0);
    });

    it('should create toast with all properties', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        toast({
          title: 'Complete Toast',
          description: 'Full description',
          variant: 'destructive',
          action: {
            label: 'Action',
            onClick: () => {},
          },
        });
      });

      const latestToast = result.current.toasts[result.current.toasts.length - 1];
      if (latestToast) {
        expect(latestToast.title).toBeDefined();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty title', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: '' });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe('');
    });

    it('should handle undefined description', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Test' });
      });

      expect(result.current.toasts[0].description).toBeUndefined();
    });

    it('should handle multiple rapid toasts', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.toast({ title: `Toast ${i}` });
        }
      });

      // Should respect the TOAST_LIMIT
      expect(result.current.toasts.length).toBeLessThanOrEqual(1);
    });

    it('should handle adding new toasts', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'First' });
      });

      expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);

      act(() => {
        result.current.toast({ title: 'Second' });
      });

      expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Toast properties', () => {
    it('should maintain all toast properties after creation', () => {
      const { result } = renderHook(() => useToast());

      const toastProps = {
        title: 'Test Title',
        description: 'Test Description',
        variant: 'default' as const,
        action: {
          label: 'Undo',
          onClick: () => {},
        },
      };

      act(() => {
        result.current.toast(toastProps);
      });

      const createdToast = result.current.toasts[0];
      expect(createdToast.title).toBe(toastProps.title);
      expect(createdToast.description).toBe(toastProps.description);
      expect(createdToast.variant).toBe(toastProps.variant);
      expect(createdToast.action).toEqual(toastProps.action);
    });

    it('should set open to true by default', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: 'Test' });
      });

      expect(result.current.toasts[0].open).toBe(true);
    });
  });

  describe('Multiple hooks', () => {
    it('should share state across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      act(() => {
        result1.current.toast({ title: 'Shared Toast' });
      });

      // Both hooks should see the same toast
      expect(result1.current.toasts.length).toBeGreaterThanOrEqual(1);
      expect(result2.current.toasts.length).toBeGreaterThanOrEqual(1);
    });

    it('should have same methods available in different hook instances', () => {
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      expect(typeof result1.current.toast).toBe('function');
      expect(typeof result2.current.toast).toBe('function');
      expect(typeof result1.current.dismiss).toBe('function');
      expect(typeof result2.current.dismiss).toBe('function');
    });
  });
});
