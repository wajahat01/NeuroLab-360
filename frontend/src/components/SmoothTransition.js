import React, { useEffect, useRef, forwardRef } from 'react';
import { useAnimations, useAnimationTiming } from '../hooks/useAnimations';

/**
 * SmoothTransition component for applying consistent animations
 * Handles animation cleanup and reduced motion preferences
 */
export const SmoothTransition = forwardRef(({
  children,
  type = 'fade',
  direction = 'up',
  delay = 0,
  duration = 400,
  stagger = false,
  staggerIndex = 0,
  className = '',
  style = {},
  onAnimationComplete,
  ...props
}, ref) => {
  const elementRef = useRef(null);
  const {
    prefersReducedMotion,
    unregisterElement,
    applyFadeIn,
    applySlideIn,
    applyScaleIn
  } = useAnimations();
  const { createTimeout } = useAnimationTiming();

  // Combine refs
  const combinedRef = (node) => {
    elementRef.current = node;
    if (ref) {
      if (typeof ref === 'function') {
        ref(node);
      } else {
        ref.current = node;
      }
    }
  };

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Apply animation based on type
    const animationOptions = {
      delay,
      duration,
      stagger,
      staggerIndex
    };

    switch (type) {
      case 'fade':
        applyFadeIn(element, animationOptions);
        break;
      case 'slide':
        applySlideIn(element, direction, animationOptions);
        break;
      case 'scale':
        applyScaleIn(element, animationOptions);
        break;
      default:
        applyFadeIn(element, animationOptions);
    }

    // Call completion callback
    if (onAnimationComplete) {
      const totalDelay = stagger ? delay + (staggerIndex * 100) : delay;
      createTimeout(onAnimationComplete, duration + totalDelay);
    }

    return () => {
      unregisterElement(element);
    };
  }, [
    type,
    direction,
    delay,
    duration,
    stagger,
    staggerIndex,
    applyFadeIn,
    applySlideIn,
    applyScaleIn,
    unregisterElement,
    onAnimationComplete,
    createTimeout
  ]);

  // If reduced motion is preferred, render without animation classes
  const finalClassName = prefersReducedMotion 
    ? className 
    : `${className} gpu-accelerated`.trim();

  return (
    <div
      ref={combinedRef}
      className={finalClassName}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
});

SmoothTransition.displayName = 'SmoothTransition';

/**
 * Staggered container for animating multiple children
 */
export const StaggeredContainer = ({
  children,
  staggerDelay = 100,
  baseDelay = 0,
  type = 'fade',
  direction = 'up',
  className = '',
  ...props
}) => {
  const childrenArray = React.Children.toArray(children);

  return (
    <div className={className} {...props}>
      {childrenArray.map((child, index) => (
        <SmoothTransition
          key={child.key || index}
          type={type}
          direction={direction}
          delay={baseDelay}
          stagger={true}
          staggerIndex={index}
        >
          {child}
        </SmoothTransition>
      ))}
    </div>
  );
};

/**
 * Fade transition component for simple fade-in effects
 */
export const FadeTransition = ({ children, delay = 0, className = '', ...props }) => (
  <SmoothTransition
    type="fade"
    delay={delay}
    className={className}
    {...props}
  >
    {children}
  </SmoothTransition>
);

/**
 * Slide transition component for directional slide-in effects
 */
export const SlideTransition = ({ 
  children, 
  direction = 'up', 
  delay = 0, 
  className = '', 
  ...props 
}) => (
  <SmoothTransition
    type="slide"
    direction={direction}
    delay={delay}
    className={className}
    {...props}
  >
    {children}
  </SmoothTransition>
);

/**
 * Scale transition component for scale-in effects
 */
export const ScaleTransition = ({ children, delay = 0, className = '', ...props }) => (
  <SmoothTransition
    type="scale"
    delay={delay}
    className={className}
    {...props}
  >
    {children}
  </SmoothTransition>
);

/**
 * Dashboard-specific transition wrapper
 */
export const DashboardTransition = ({ children, section, index = 0, ...props }) => {
  const getSectionConfig = (section, index) => {
    const configs = {
      header: { type: 'fade', delay: 0 },
      stats: { type: 'fade', delay: 100, stagger: true, staggerIndex: index },
      charts: { type: 'slide', direction: 'up', delay: 200, stagger: true, staggerIndex: index },
      content: { type: 'fade', delay: 150 }
    };

    return configs[section] || configs.content;
  };

  const config = getSectionConfig(section, index);

  return (
    <SmoothTransition {...config} {...props}>
      {children}
    </SmoothTransition>
  );
};

export default SmoothTransition;