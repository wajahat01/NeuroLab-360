import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import SmoothTransition, { 
  StaggeredContainer, 
  FadeTransition, 
  SlideTransition, 
  ScaleTransition,
  DashboardTransition 
} from '../SmoothTransition';

// Mock the useAnimations hook
jest.mock('../../hooks/useAnimations', () => ({
  useAnimations: () => ({
    prefersReducedMotion: false,
    registerElement: () => {},
    unregisterElement: () => {},
    applyFadeIn: () => {},
    applySlideIn: () => {},
    applyScaleIn: () => {},
    getAnimationClass: (className) => className,
    getStaggeredClasses: (count) => Array(count).fill('fade-in-content')
  }),
  useAnimationTiming: () => ({
    createTimeout: (callback, delay) => setTimeout(callback, delay),
    clearManagedTimeout: () => {},
    clearAllTimeouts: () => {}
  }),
  useEntranceAnimations: () => ({
    isReady: true,
    shouldAnimate: true
  })
}));

describe('SmoothTransition Components', () => {
  describe('SmoothTransition', () => {
    it('renders children without layout shifts', () => {
      const { container } = render(
        <SmoothTransition>
          <div data-testid="content">Test Content</div>
        </SmoothTransition>
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('gpu-accelerated');
    });

    it('applies custom className', () => {
      const { container } = render(
        <SmoothTransition className="test-class">
          <div>Content</div>
        </SmoothTransition>
      );

      expect(container.firstChild).toHaveClass('test-class');
      expect(container.firstChild).toHaveClass('gpu-accelerated');
    });

    it('handles different animation types', () => {
      render(
        <SmoothTransition type="slide" direction="up">
          <div data-testid="slide-content">Content</div>
        </SmoothTransition>
      );

      expect(screen.getByTestId('slide-content')).toBeInTheDocument();
    });
  });

  describe('StaggeredContainer', () => {
    it('renders multiple children with staggered animations', () => {
      render(
        <StaggeredContainer>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
          <div data-testid="child-3">Child 3</div>
        </StaggeredContainer>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByTestId('child-3')).toBeInTheDocument();
    });

    it('applies custom className to container', () => {
      const { container } = render(
        <StaggeredContainer className="custom-grid">
          <div>Child</div>
        </StaggeredContainer>
      );

      expect(container.firstChild).toHaveClass('custom-grid');
    });
  });

  describe('Specialized Transition Components', () => {
    it('FadeTransition renders content', () => {
      render(
        <FadeTransition delay={100}>
          <div data-testid="fade-content">Fade Content</div>
        </FadeTransition>
      );

      expect(screen.getByTestId('fade-content')).toBeInTheDocument();
    });

    it('SlideTransition renders content', () => {
      render(
        <SlideTransition direction="left" delay={200}>
          <div data-testid="slide-content">Slide Content</div>
        </SlideTransition>
      );

      expect(screen.getByTestId('slide-content')).toBeInTheDocument();
    });

    it('ScaleTransition renders content', () => {
      render(
        <ScaleTransition delay={150}>
          <div data-testid="scale-content">Scale Content</div>
        </ScaleTransition>
      );

      expect(screen.getByTestId('scale-content')).toBeInTheDocument();
    });

    it('DashboardTransition renders content', () => {
      render(
        <DashboardTransition section="stats" index={2}>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </DashboardTransition>
      );

      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
    });
  });

  describe('Layout Stability', () => {
    it('maintains consistent dimensions during animation', () => {
      const { container } = render(
        <SmoothTransition>
          <div style={{ width: '200px', height: '100px' }}>
            Fixed Size Content
          </div>
        </SmoothTransition>
      );

      const element = container.firstChild.firstChild;
      expect(element).toHaveStyle('width: 200px');
      expect(element).toHaveStyle('height: 100px');
    });

    it('prevents layout shifts with stable positioning', () => {
      const { container } = render(
        <SmoothTransition className="relative">
          <div className="absolute top-0 left-0">
            Positioned Content
          </div>
        </SmoothTransition>
      );

      expect(container.firstChild).toHaveClass('relative');
      expect(container.firstChild.firstChild).toHaveClass('absolute');
    });
  });

  describe('Performance Optimization', () => {
    it('applies GPU acceleration for smooth animations', () => {
      const { container } = render(
        <SmoothTransition>
          <div>Content</div>
        </SmoothTransition>
      );

      expect(container.firstChild).toHaveClass('gpu-accelerated');
    });
  });
});