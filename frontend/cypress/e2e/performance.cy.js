describe('Performance and Visual Regression Tests', () => {
  beforeEach(() => {
    // Set up performance monitoring
    cy.window().then((win) => {
      // Clear any existing performance marks
      win.performance.clearMarks();
      win.performance.clearMeasures();
    });
  });

  describe('Login to Dashboard Performance', () => {
    it('should complete login-to-dashboard transition within performance budget', () => {
      cy.visit('/login');
      
      // Mark the start of login process
      cy.window().then((win) => {
        win.performance.mark('login-start');
      });

      // Perform login
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      
      cy.get('[data-testid="login-button"]').click();

      // Wait for dashboard to appear and mark completion
      cy.get('[data-testid="dashboard-container"]', { timeout: 10000 }).should('be.visible');
      
      cy.window().then((win) => {
        win.performance.mark('dashboard-loaded');
        win.performance.measure('login-to-dashboard', 'login-start', 'dashboard-loaded');
        
        const measure = win.performance.getEntriesByName('login-to-dashboard')[0];
        
        // Performance budget: should complete within 3 seconds
        expect(measure.duration).to.be.lessThan(3000);
        
        cy.log(`Login to Dashboard took: ${measure.duration.toFixed(2)}ms`);
      });
    });

    it('should not show flickering during login transition', () => {
      cy.visit('/login');
      
      // Set up mutation observer to detect layout shifts
      cy.window().then((win) => {
        win.layoutShifts = [];
        
        if ('LayoutShift' in win) {
          const observer = new win.PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
                win.layoutShifts.push(entry.value);
              }
            }
          });
          observer.observe({ entryTypes: ['layout-shift'] });
        }
      });

      // Perform login
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      cy.get('[data-testid="login-button"]').click();

      // Wait for dashboard
      cy.get('[data-testid="dashboard-container"]').should('be.visible');

      // Check for layout shifts
      cy.window().then((win) => {
        if (win.layoutShifts) {
          const totalShift = win.layoutShifts.reduce((sum, shift) => sum + shift, 0);
          
          // Cumulative Layout Shift should be minimal (< 0.1 is good)
          expect(totalShift).to.be.lessThan(0.1);
          
          cy.log(`Total Layout Shift: ${totalShift.toFixed(4)}`);
        }
      });
    });

    it('should show consistent loading states without flashing', () => {
      cy.visit('/login');
      
      // Track loading state changes
      const loadingStates = [];
      
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      
      // Monitor for loading indicators
      cy.get('[data-testid="login-button"]').click();
      
      // Should show loading state immediately
      cy.get('[data-testid="loading-spinner"]', { timeout: 1000 })
        .should('be.visible')
        .then(() => {
          loadingStates.push('loading-shown');
        });
      
      // Should transition to dashboard without intermediate states
      cy.get('[data-testid="dashboard-container"]').should('be.visible');
      
      // Should not show login form again
      cy.get('[data-testid="login-form"]').should('not.exist');
    });
  });

  describe('Dashboard Loading Performance', () => {
    beforeEach(() => {
      // Login first
      cy.login('test@example.com', 'password123');
    });

    it('should load dashboard components progressively without flickering', () => {
      cy.visit('/dashboard');
      
      // Mark start of dashboard load
      cy.window().then((win) => {
        win.performance.mark('dashboard-load-start');
      });

      // Should show skeleton loading first
      cy.get('[data-testid="dashboard-skeleton"]').should('be.visible');
      
      // Dashboard container should appear
      cy.get('[data-testid="dashboard-container"]').should('be.visible');
      
      // Skeleton should disappear
      cy.get('[data-testid="dashboard-skeleton"]').should('not.exist');
      
      // Main content should be visible
      cy.get('[data-testid="dashboard-content"]').should('be.visible');
      
      cy.window().then((win) => {
        win.performance.mark('dashboard-load-end');
        win.performance.measure('dashboard-load', 'dashboard-load-start', 'dashboard-load-end');
        
        const measure = win.performance.getEntriesByName('dashboard-load')[0];
        
        // Dashboard should load within 2 seconds
        expect(measure.duration).to.be.lessThan(2000);
        
        cy.log(`Dashboard load took: ${measure.duration.toFixed(2)}ms`);
      });
    });

    it('should maintain stable layout during data loading', () => {
      cy.visit('/dashboard');
      
      // Get initial dimensions
      cy.get('[data-testid="dashboard-container"]').then(($container) => {
        const initialHeight = $container.height();
        const initialWidth = $container.width();
        
        // Wait for data to load
        cy.get('[data-testid="dashboard-content"]').should('be.visible');
        
        // Check dimensions haven't changed significantly
        cy.get('[data-testid="dashboard-container"]').should(($newContainer) => {
          const newHeight = $newContainer.height();
          const newWidth = $newContainer.width();
          
          // Allow small variations (within 5%)
          expect(Math.abs(newHeight - initialHeight) / initialHeight).to.be.lessThan(0.05);
          expect(Math.abs(newWidth - initialWidth) / initialWidth).to.be.lessThan(0.05);
        });
      });
    });

    it('should handle navigation between pages smoothly', () => {
      cy.visit('/dashboard');
      cy.get('[data-testid="dashboard-container"]').should('be.visible');
      
      // Navigate to experiments
      cy.get('[data-testid="nav-experiments"]').click();
      
      // Should transition smoothly without flickering
      cy.get('[data-testid="experiments-container"]').should('be.visible');
      
      // Navigate back to dashboard
      cy.get('[data-testid="nav-dashboard"]').click();
      
      // Should return to dashboard smoothly
      cy.get('[data-testid="dashboard-container"]').should('be.visible');
    });
  });

  describe('Error State Performance', () => {
    it('should handle authentication errors gracefully', () => {
      // Mock authentication failure
      cy.intercept('POST', '**/auth/v1/token*', {
        statusCode: 400,
        body: { error: 'Invalid credentials' }
      }).as('loginError');

      cy.visit('/login');
      
      cy.get('[data-testid="email-input"]').type('invalid@example.com');
      cy.get('[data-testid="password-input"]').type('wrongpassword');
      cy.get('[data-testid="login-button"]').click();
      
      cy.wait('@loginError');
      
      // Should show error without flickering
      cy.get('[data-testid="error-message"]').should('be.visible');
      
      // Login form should remain stable
      cy.get('[data-testid="login-form"]').should('be.visible');
      
      // Should not show dashboard
      cy.get('[data-testid="dashboard-container"]').should('not.exist');
    });

    it('should handle dashboard data loading errors gracefully', () => {
      cy.login('test@example.com', 'password123');
      
      // Mock dashboard data error
      cy.intercept('GET', '**/experiments*', {
        statusCode: 500,
        body: { error: 'Server error' }
      }).as('dashboardError');

      cy.visit('/dashboard');
      
      cy.wait('@dashboardError');
      
      // Should show error boundary without crashing
      cy.get('[data-testid="error-fallback"]').should('be.visible');
      
      // Should maintain layout structure
      cy.get('[data-testid="dashboard-container"]').should('be.visible');
    });
  });

  describe('Performance Monitoring', () => {
    it('should collect and report performance metrics', () => {
      cy.visit('/login');
      
      // Enable performance monitoring
      cy.window().then((win) => {
        win.performanceMetrics = {
          renders: [],
          transitions: []
        };
        
        // Mock performance observer
        if (win.PerformanceObserver) {
          const observer = new win.PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === 'measure') {
                win.performanceMetrics.transitions.push({
                  name: entry.name,
                  duration: entry.duration,
                  startTime: entry.startTime
                });
              }
            }
          });
          observer.observe({ entryTypes: ['measure'] });
        }
      });

      // Perform login flow
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      cy.get('[data-testid="login-button"]').click();
      
      cy.get('[data-testid="dashboard-container"]').should('be.visible');
      
      // Check collected metrics
      cy.window().then((win) => {
        if (win.performanceMetrics) {
          cy.log('Performance Metrics:', win.performanceMetrics);
          
          // Should have collected some performance data
          expect(win.performanceMetrics.transitions.length).to.be.greaterThan(0);
        }
      });
    });

    it('should detect performance regressions', () => {
      const performanceBudgets = {
        loginToDashboard: 3000, // 3 seconds
        dashboardLoad: 2000,    // 2 seconds
        pageTransition: 1000    // 1 second
      };

      cy.visit('/login');
      
      // Measure login to dashboard
      cy.window().then((win) => {
        win.performance.mark('test-start');
      });

      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      cy.get('[data-testid="login-button"]').click();
      
      cy.get('[data-testid="dashboard-container"]').should('be.visible');
      
      cy.window().then((win) => {
        win.performance.mark('test-end');
        win.performance.measure('full-test', 'test-start', 'test-end');
        
        const measure = win.performance.getEntriesByName('full-test')[0];
        
        // Check against performance budget
        expect(measure.duration).to.be.lessThan(performanceBudgets.loginToDashboard);
        
        // Log performance for monitoring
        cy.task('log', {
          type: 'performance',
          metric: 'login-to-dashboard',
          duration: measure.duration,
          budget: performanceBudgets.loginToDashboard,
          passed: measure.duration < performanceBudgets.loginToDashboard,
          timestamp: new Date().toISOString()
        });
      });
    });
  });
});