import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { 
  useAnimations, 
  useAnimationTiming, 
  useEntranceAnimations 
} from '../useAnimations';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('useAnimations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('reduced motion detection', () => {
    it('detects reduced motion preference', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));

      const { result } = renderHook(() => useAnimations());

      expect(result.current.prefersReducedMotion).toBe(true);
    });

    it('responds to reduced motion preference changes', () => {
      let mediaQueryCallback;
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addEventListener: jest.fn((event, callback) => {
          if (event === 'change') {
            mediaQueryCallback = callback;
          }
        }),
        removeEventListener: jest.fn(),
      }));

      const { result } = renderHook(() => useAnimations());

      expect(result.current.prefersReducedMotion).toBe(false);

      // Simulate preference change
      act(() => {
        mediaQueryCallback({ matches: true });
      });

      expect(result.current.prefersReducedMotion).toBe(true);
    });
  });

  describe('element registration', () => {
    it('registers and unregisters elements', () => {
      const { result } = renderHook(() => useAnimations());
      const mockElement = { style: {} };

      act(() => {
        result.current.registerElement(mockElement);
      });

      // Element should be registered (we can't directly test the Set, but we can test cleanup)
      act(() => {
        result.current.unregisterElement(mockElement);
      });

      expect(mockElement.style.willChange).toBe('auto');
    });

    it('handles null elements gracefully', () => {
      const { result } = renderHook(() => useAnimations());

      expect(() => {
        act(() => {
          result.current.registerElement(null);
          result.current.unregisterElement(null);
        });
      }).not.toThrow();
    });
  });

  describe('animation application', () => {
    let mockElement;

    beforeEach(() => {
      mockElement = {
        style: {}
      };
    });

    it('applies fade-in animation', () => {
      const { result } = renderHook(() => useAnimations());

      act(() => {
        result.current.applyFadeIn(mockElement, { delay: 100, duration: 300 });
      });

      expect(mockElement.style.opacity).toBe('0');
      expect(mockElement.style.transform).toBe('translateY(12px)');
      expect(mockElement.style.willChange).toBe('opacity, transform');
      expect(mockElement.style.animation).toContain('fadeInContent');
      expect(mockElement.style.animation).toContain('300ms');
      expect(mockElement.style.animation).toContain('100ms');
    });

    it('applies slide-in animation with direction', () => {
      const { result } = renderHook(() => useAnimations());

      act(() => {
        result.current.applySlideIn(mockElement, 'left', { delay: 50, duration: 400 });
      });

      expect(mockElement.style.opacity).toBe('0');
      expect(mockElement.style.transform).toBe('translateX(-24px)');
      expect(mockElement.style.willChange).toBe('opacity, transform');
      expect(mockElement.style.animation).toContain('slideInLeft');
    });

    it('applies scale-in animation', () => {
      const { result } = renderHook(() => useAnimations());

      act(() => {
        result.current.applyScaleIn(mockElement, { delay: 0, duration: 250 });
      });

      expect(mockElement.style.opacity).toBe('0');
      expect(mockElement.style.transform).toBe('scale(0.95)');
      expect(mockElement.style.willChange).toBe('opacity, transform');
      expect(mockElement.style.animation).toContain('scaleIn');
    });

    it('applies staggered animations', () => {
      const { result } = renderHook(() => useAnimations());

      act(() => {
        result.current.applyFadeIn(mockElement, {
          delay: 100,
          stagger: true,
          staggerIndex: 2,
          staggerDelay: 50
        });
      });

      // Total delay should be 100 + (2 * 50) = 200ms
      expect(mockElement.style.animation).toContain('200ms');
    });

    it('skips animation when reduced motion is preferred', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));

      const { result } = renderHook(() => useAnimations());

      act(() => {
        result.current.applyFadeIn(mockElement);
      });

      expect(mockElement.style.opacity).toBe('1');
      expect(mockElement.style.transform).toBe('none');
      expect(mockElement.style.animation).toBeUndefined();
    });

    it('cleans up animations after completion', async () => {
      const { result } = renderHook(() => useAnimations());

      act(() => {
        result.current.applyFadeIn(mockElement, { duration: 100 });
      });

      // Fast-forward time to after animation completion
      act(() => {
        jest.advanceTimersByTime(200);
      });

      await waitFor(() => {
        expect(mockElement.style.willChange).toBe('auto');
      });
    });
  });

  describe('utility functions', () => {
    it('returns animation classes based on reduced motion preference', () => {
      const { result } = renderHook(() => useAnimations());

      expect(result.current.getAnimationClass('fade-in')).toBe('fade-in');

      // Test with reduced motion
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));

      const { result: reducedResult } = renderHook(() => useAnimations());
      expect(reducedResult.current.getAnimationClass('fade-in')).toBe('');
    });

    it('generates staggered classes', () => {
      const { result } = renderHook(() => useAnimations());

      const classes = result.current.getStaggeredClasses(3, 'custom-fade');
      expect(classes).toHaveLength(3);
      expect(classes[0]).toBe('custom-fade');
      expect(classes[1]).toBe('fade-in-stagger-1');
      expect(classes[2]).toBe('fade-in-stagger-2');
    });

    it('returns empty classes for reduced motion', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }));

      const { result } = renderHook(() => useAnimations());

      const classes = result.current.getStaggeredClasses(3);
      expect(classes).toEqual(['', '', '']);
    });
  });
});

describe('useAnimationTiming', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('creates managed timeouts', () => {
    const { result } = renderHook(() => useAnimationTiming());
    const callback = jest.fn();

    act(() => {
      result.current.createTimeout(callback, 1000);
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalled();
  });

  it('clears specific timeouts', () => {
    const { result } = renderHook(() => useAnimationTiming());
    const callback = jest.fn();

    let timeoutId;
    act(() => {
      timeoutId = result.current.createTimeout(callback, 1000);
    });

    act(() => {
      result.current.clearManagedTimeout(timeoutId);
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('clears all timeouts', () => {
    const { result } = renderHook(() => useAnimationTiming());
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    act(() => {
      result.current.createTimeout(callback1, 1000);
      result.current.createTimeout(callback2, 2000);
    });

    act(() => {
      result.current.clearAllTimeouts();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  it('cleans up timeouts on unmount', () => {
    const { result, unmount } = renderHook(() => useAnimationTiming());
    const callback = jest.fn();

    act(() => {
      result.current.createTimeout(callback, 1000);
    });

    unmount();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('useEntranceAnimations', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('becomes ready after delay', async () => {
    const { result } = renderHook(() => useEntranceAnimations());

    expect(result.current.isReady).toBe(false);
    expect(result.current.shouldAnimate).toBe(false);

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
      expect(result.current.shouldAnimate).toBe(true);
    });
  });

  it('becomes ready immediately with reduced motion', async () => {
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const { result } = renderHook(() => useEntranceAnimations());

    expect(result.current.isReady).toBe(true);
    expect(result.current.shouldAnimate).toBe(false);
  });

  it('reacts to dependency changes', async () => {
    let dependencies = ['dep1'];
    const { result, rerender } = renderHook(() => useEntranceAnimations(dependencies));

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Change dependencies
    dependencies = ['dep2'];
    rerender();

    expect(result.current.isReady).toBe(false);

    act(() => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });
});