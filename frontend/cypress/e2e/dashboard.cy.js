describe('Dashboard Page', () => {
  beforeEach(() => {
    cy.cleanupTestData();
    cy.mockAuth();
  });

  it('should display empty dashboard state', () => {
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 0,
      experiments_by_type: {},
      experiments_by_status: {},
      recent_activity: { completion_rate: 0 },
      average_metrics: {},
      last_updated: new Date().toISOString()
    });

    cy.mockApiResponse('GET', '**/api/dashboard/charts*', {
      activity_timeline: [],
      experiment_type_distribution: [],
      performance_trends: [],
      metric_comparisons: [],
      period: '30d',
      total_experiments: 0,
      date_range: { start: new Date().toISOString(), end: new Date().toISOString() }
    });

    cy.login();
    
    cy.get('[data-testid="dashboard-summary"]').should('be.visible');
    cy.get('[data-testid="total-experiments"]').should('contain', '0');
    cy.get('[data-testid="empty-state"]').should('be.visible');
    cy.get('[data-testid="create-first-experiment-button"]').should('be.visible');
  });

  it('should display dashboard with experiment data', () => {
    const mockSummary = {
      total_experiments: 5,
      experiments_by_type: {
        heart_rate: 2,
        reaction_time: 2,
        memory: 1
      },
      experiments_by_status: {
        completed: 4,
        pending: 1
      },
      recent_activity: { 
        completion_rate: 80,
        experiments_this_week: 3
      },
      average_metrics: {
        mean: 125.5,
        std_dev: 15.2
      },
      last_updated: new Date().toISOString()
    };

    const mockCharts = {
      activity_timeline: [
        { date: '2024-01-01', count: 2 },
        { date: '2024-01-02', count: 1 },
        { date: '2024-01-03', count: 2 }
      ],
      experiment_type_distribution: [
        { type: 'heart_rate', count: 2, percentage: 40 },
        { type: 'reaction_time', count: 2, percentage: 40 },
        { type: 'memory', count: 1, percentage: 20 }
      ],
      performance_trends: [
        { date: '2024-01-01', value: 120 },
        { date: '2024-01-02', value: 125 },
        { date: '2024-01-03', value: 130 }
      ],
      metric_comparisons: {
        current_period: 125.5,
        previous_period: 120.0,
        change_percentage: 4.6
      },
      period: '30d',
      total_experiments: 5,
      date_range: { 
        start: '2024-01-01T00:00:00Z', 
        end: '2024-01-31T23:59:59Z' 
      }
    };

    cy.mockApiResponse('GET', '**/api/dashboard/summary*', mockSummary);
    cy.mockApiResponse('GET', '**/api/dashboard/charts*', mockCharts);

    cy.login();
    
    // Check summary cards
    cy.get('[data-testid="total-experiments"]').should('contain', '5');
    cy.get('[data-testid="completion-rate"]').should('contain', '80%');
    cy.get('[data-testid="experiments-this-week"]').should('contain', '3');
    
    // Check charts are rendered
    cy.get('[data-testid="activity-timeline-chart"]').should('be.visible');
    cy.get('[data-testid="experiment-type-chart"]').should('be.visible');
    cy.get('[data-testid="performance-trends-chart"]').should('be.visible');
    
    // Check experiment type distribution
    cy.get('[data-testid="type-heart-rate"]').should('contain', '2');
    cy.get('[data-testid="type-reaction-time"]').should('contain', '2');
    cy.get('[data-testid="type-memory"]').should('contain', '1');
  });

  it('should handle loading states', () => {
    // Delay the API response to test loading state
    cy.intercept('GET', '**/api/dashboard/summary*', (req) => {
      req.reply((res) => {
        res.delay(1000);
        res.send({
          total_experiments: 0,
          experiments_by_type: {},
          experiments_by_status: {},
          recent_activity: { completion_rate: 0 },
          average_metrics: {},
          last_updated: new Date().toISOString()
        });
      });
    });

    cy.intercept('GET', '**/api/dashboard/charts*', (req) => {
      req.reply((res) => {
        res.delay(1000);
        res.send({
          activity_timeline: [],
          experiment_type_distribution: [],
          performance_trends: [],
          metric_comparisons: [],
          period: '30d',
          total_experiments: 0,
          date_range: { start: new Date().toISOString(), end: new Date().toISOString() }
        });
      });
    });

    cy.login();
    
    // Should show loading skeletons
    cy.get('[data-testid="loading-skeleton"]').should('be.visible');
    
    // Wait for loading to complete
    cy.waitForLoading();
    
    // Should show actual content
    cy.get('[data-testid="dashboard-summary"]').should('be.visible');
  });

  it('should handle API errors gracefully', () => {
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      error: 'Failed to fetch dashboard data'
    }, 500);

    cy.mockApiResponse('GET', '**/api/dashboard/charts*', {
      error: 'Failed to fetch chart data'
    }, 500);

    cy.login();
    
    cy.get('[data-testid="error-message"]').should('be.visible');
    cy.get('[data-testid="retry-button"]').should('be.visible');
  });

  it('should refresh data when retry button is clicked', () => {
    // First request fails
    cy.intercept('GET', '**/api/dashboard/summary*', { statusCode: 500 }).as('failedRequest');
    
    cy.login();
    cy.wait('@failedRequest');
    
    // Mock successful retry
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 1,
      experiments_by_type: { heart_rate: 1 },
      experiments_by_status: { completed: 1 },
      recent_activity: { completion_rate: 100 },
      average_metrics: { mean: 75 },
      last_updated: new Date().toISOString()
    });

    cy.mockApiResponse('GET', '**/api/dashboard/charts*', {
      activity_timeline: [],
      experiment_type_distribution: [{ type: 'heart_rate', count: 1, percentage: 100 }],
      performance_trends: [],
      metric_comparisons: {},
      period: '30d',
      total_experiments: 1,
      date_range: { start: new Date().toISOString(), end: new Date().toISOString() }
    });
    
    cy.get('[data-testid="retry-button"]').click();
    
    // Should show successful data
    cy.get('[data-testid="total-experiments"]').should('contain', '1');
  });

  it('should navigate to experiments page from dashboard', () => {
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 0,
      experiments_by_type: {},
      experiments_by_status: {},
      recent_activity: { completion_rate: 0 },
      average_metrics: {},
      last_updated: new Date().toISOString()
    });

    cy.mockApiResponse('GET', '**/api/dashboard/charts*', {
      activity_timeline: [],
      experiment_type_distribution: [],
      performance_trends: [],
      metric_comparisons: [],
      period: '30d',
      total_experiments: 0,
      date_range: { start: new Date().toISOString(), end: new Date().toISOString() }
    });

    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    cy.login();
    
    cy.get('[data-testid="create-first-experiment-button"]').click();
    cy.url().should('include', '/experiments');
  });

  it('should be responsive on mobile devices', () => {
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 3,
      experiments_by_type: { heart_rate: 3 },
      experiments_by_status: { completed: 3 },
      recent_activity: { completion_rate: 100 },
      average_metrics: { mean: 75 },
      last_updated: new Date().toISOString()
    });

    cy.mockApiResponse('GET', '**/api/dashboard/charts*', {
      activity_timeline: [],
      experiment_type_distribution: [{ type: 'heart_rate', count: 3, percentage: 100 }],
      performance_trends: [],
      metric_comparisons: {},
      period: '30d',
      total_experiments: 3,
      date_range: { start: new Date().toISOString(), end: new Date().toISOString() }
    });

    cy.viewport('iphone-6');
    cy.login();
    
    // Should be responsive
    cy.get('[data-testid="dashboard-summary"]').should('be.visible');
    cy.get('[data-testid="mobile-chart-container"]').should('be.visible');
  });

  it('should check accessibility', () => {
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 0,
      experiments_by_type: {},
      experiments_by_status: {},
      recent_activity: { completion_rate: 0 },
      average_metrics: {},
      last_updated: new Date().toISOString()
    });

    cy.mockApiResponse('GET', '**/api/dashboard/charts*', {
      activity_timeline: [],
      experiment_type_distribution: [],
      performance_trends: [],
      metric_comparisons: [],
      period: '30d',
      total_experiments: 0,
      date_range: { start: new Date().toISOString(), end: new Date().toISOString() }
    });

    cy.login();
    cy.checkA11y();
  });
});