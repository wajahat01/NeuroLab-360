describe('Authentication Flow', () => {
  beforeEach(() => {
    cy.cleanupTestData();
  });

  it('should display login page by default', () => {
    cy.visit('/');
    cy.url().should('include', '/login');
    cy.get('[data-testid="login-form"]').should('be.visible');
    cy.get('[data-testid="email-input"]').should('be.visible');
    cy.get('[data-testid="password-input"]').should('be.visible');
    cy.get('[data-testid="login-button"]').should('be.visible');
  });

  it('should show validation errors for empty fields', () => {
    cy.visit('/login');
    cy.get('[data-testid="login-button"]').click();
    
    cy.get('[data-testid="email-error"]').should('contain', 'Email is required');
    cy.get('[data-testid="password-error"]').should('contain', 'Password is required');
  });

  it('should show error for invalid email format', () => {
    cy.visit('/login');
    cy.get('[data-testid="email-input"]').type('invalid-email');
    cy.get('[data-testid="password-input"]').type('password123');
    cy.get('[data-testid="login-button"]').click();
    
    cy.get('[data-testid="email-error"]').should('contain', 'Please enter a valid email');
  });

  it('should successfully login with valid credentials', () => {
    cy.mockAuth();
    
    // Mock successful experiments and dashboard data
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });
    
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 0,
      experiments_by_type: {},
      experiments_by_status: {},
      recent_activity: { completion_rate: 0 },
      average_metrics: {},
      last_updated: new Date().toISOString()
    });

    cy.login();
    
    // Should redirect to dashboard
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="navbar"]').should('be.visible');
    cy.get('[data-testid="user-email"]').should('contain', 'test@example.com');
  });

  it('should show error for invalid credentials', () => {
    // Mock failed login
    cy.mockApiResponse('POST', '**/auth/v1/token*', {
      error: 'Invalid login credentials'
    }, 400);

    cy.visit('/login');
    cy.get('[data-testid="email-input"]').type('wrong@example.com');
    cy.get('[data-testid="password-input"]').type('wrongpassword');
    cy.get('[data-testid="login-button"]').click();
    
    cy.shouldShowToast('Invalid login credentials', 'error');
  });

  it('should successfully logout', () => {
    cy.mockAuth();
    cy.mockApiResponse('GET', '**/api/experiments*', { experiments: [], total: 0 });
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 0,
      experiments_by_type: {},
      experiments_by_status: {},
      recent_activity: { completion_rate: 0 },
      average_metrics: {},
      last_updated: new Date().toISOString()
    });

    cy.login();
    cy.logout();
    
    cy.url().should('include', '/login');
    cy.get('[data-testid="login-form"]').should('be.visible');
  });

  it('should redirect to login when accessing protected routes without auth', () => {
    cy.visit('/dashboard');
    cy.url().should('include', '/login');
    
    cy.visit('/experiments');
    cy.url().should('include', '/login');
  });

  it('should maintain session across page refreshes', () => {
    cy.mockAuth();
    cy.mockApiResponse('GET', '**/api/experiments*', { experiments: [], total: 0 });
    cy.mockApiResponse('GET', '**/api/dashboard/summary*', {
      total_experiments: 0,
      experiments_by_type: {},
      experiments_by_status: {},
      recent_activity: { completion_rate: 0 },
      average_metrics: {},
      last_updated: new Date().toISOString()
    });

    cy.login();
    cy.reload();
    
    // Should still be logged in
    cy.url().should('include', '/dashboard');
    cy.get('[data-testid="navbar"]').should('be.visible');
  });
});