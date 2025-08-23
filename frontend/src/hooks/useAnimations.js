import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook for managing smooth transition animations with proper cleanup
 * Provides animation utilities that respect user preferences and prevent memory leaks
 */
export const useAnimations = () => {
  const animationRefs = useRef(new Set());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    // Check if matchMedia is available (for testing environments)
    if (!window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Cleanup all animations on unmount
  useEffect(() => {
    return () => {
      animationRefs.current.forEach(element => {
        if (element && element.style) {
          element.style.willChange = 'auto';
          element.style.animation = '';
        }
      });
      animationRefs.current.clear();
    };
  }, []);

  /**
   * Register an element for animation cleanup
   */
  const registerElement = useCallback((element) => {
    if (element) {
      animationRefs.current.add(element);
    }
  }, []);

  /**
   * Unregister an element from animation cleanup
   */
  const unregisterElement = useCallback((element) => {
    if (element) {
      animationRefs.current.delete(element);
      if (element.style) {
        element.style.willChange = 'auto';
      }
    }
  }, []);

  /**
   * Apply fade-in animation with stagger support
   */
  const applyFadeIn = useCallback((element, options = {}) => {
    if (!element || prefersReducedMotion) {
      if (element) {
        element.style.opacity = '1';
        element.style.transform = 'none';
      }
      return;
    }

    const {
      delay = 0,
      duration = 400,
      stagger = false,
      staggerIndex = 0,
      staggerDelay = 100
    } = options;

    const totalDelay = stagger ? delay + (staggerIndex * staggerDelay) : delay;

    registerElement(element);
    
    element.style.opacity = '0';
    element.style.transform = 'translateY(12px)';
    element.style.willChange = 'opacity, transform';
    element.style.animation = `fadeInContent ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) ${totalDelay}ms forwards`;

    // Cleanup after animation completes
    const cleanup = () => {
      if (element.style) {
        element.style.willChange = 'auto';
      }
    };

    setTimeout(cleanup, duration + totalDelay + 50);
  }, [prefersReducedMotion, registerElement]);

  /**
   * Apply slide-in animation
   */
  const applySlideIn = useCallback((element, direction = 'up', options = {}) => {
    if (!element || prefersReducedMotion) {
      if (element) {
        element.style.opacity = '1';
        element.style.transform = 'none';
      }
      return;
    }

    const { delay = 0, duration = 400 } = options;
    
    registerElement(element);

    const transforms = {
      up: 'translateY(24px)',
      down: 'translateY(-24px)',
      left: 'translateX(-24px)',
      right: 'translateX(24px)'
    };

    element.style.opacity = '0';
    element.style.transform = transforms[direction] || transforms.up;
    element.style.willChange = 'opacity, transform';
    element.style.animation = `slideIn${direction.charAt(0).toUpperCase() + direction.slice(1)} ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms forwards`;

    // Cleanup after animation completes
    const cleanup = () => {
      if (element.style) {
        element.style.willChange = 'auto';
      }
    };

    setTimeout(cleanup, duration + delay + 50);
  }, [prefersReducedMotion, registerElement]);

  /**
   * Apply scale-in animation
   */
  const applyScaleIn = useCallback((element, options = {}) => {
    if (!element || prefersReducedMotion) {
      if (element) {
        element.style.opacity = '1';
        element.style.transform = 'none';
      }
      return;
    }

    const { delay = 0, duration = 300 } = options;
    
    registerElement(element);

    element.style.opacity = '0';
    element.style.transform = 'scale(0.95)';
    element.style.willChange = 'opacity, transform';
    element.style.animation = `scaleIn ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms forwards`;

    // Cleanup after animation completes
    const cleanup = () => {
      if (element.style) {
        element.style.willChange = 'auto';
      }
    };

    setTimeout(cleanup, duration + delay + 50);
  }, [prefersReducedMotion, registerElement]);

  /**
   * Get animation class names based on reduced motion preference
   */
  const getAnimationClass = useCallback((baseClass) => {
    return prefersReducedMotion ? '' : baseClass;
  }, [prefersReducedMotion]);

  /**
   * Create staggered animation classes for multiple elements
   */
  const getStaggeredClasses = useCallback((count, baseClass = 'fade-in-content') => {
    if (prefersReducedMotion) {
      return Array(count).fill('');
    }

    return Array.from({ length: count }, (_, index) => {
      if (index === 0) return getAnimationClass(baseClass);
      return getAnimationClass(`fade-in-stagger-${Math.min(index, 4)}`);
    });
  }, [prefersReducedMotion, getAnimationClass]);

  return {
    prefersReducedMotion,
    registerElement,
    unregisterElement,
    applyFadeIn,
    applySlideIn,
    applyScaleIn,
    getAnimationClass,
    getStaggeredClasses
  };
};

/**
 * Hook for managing animation timing and coordination
 */
export const useAnimationTiming = () => {
  const timeoutsRef = useRef(new Set());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  /**
   * Create a managed timeout that will be cleaned up automatically
   */
  const createTimeout = useCallback((callback, delay) => {
    const timeout = setTimeout(() => {
      callback();
      timeoutsRef.current.delete(timeout);
    }, delay);

    timeoutsRef.current.add(timeout);
    return timeout;
  }, []);

  /**
   * Clear a specific timeout
   */
  const clearManagedTimeout = useCallback((timeout) => {
    clearTimeout(timeout);
    timeoutsRef.current.delete(timeout);
  }, []);

  /**
   * Clear all managed timeouts
   */
  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();
  }, []);

  return {
    createTimeout,
    clearManagedTimeout,
    clearAllTimeouts
  };
};

/**
 * Hook for coordinating entrance animations across multiple components
 */
export const useEntranceAnimations = (dependencies = []) => {
  const [isReady, setIsReady] = useState(false);
  const { prefersReducedMotion } = useAnimations();

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsReady(true);
      return;
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [...dependencies, prefersReducedMotion]);

  return {
    isReady,
    shouldAnimate: isReady && !prefersReducedMotion
  };
};