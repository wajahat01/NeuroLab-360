// Custom commands for NeuroLab 360 testing

// Login command
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login');
  cy.get('[data-testid="email-input"]').type(email || Cypress.env('testUser').email);
  cy.get('[data-testid="password-input"]').type(password || Cypress.env('testUser').password);
  cy.get('[data-testid="login-button"]').click();
  
  // Wait for redirect to dashboard
  cy.url().should('include', '/dashboard');
  cy.get('[data-testid="navbar"]').should('be.visible');
});

// Logout command
Cypress.Commands.add('logout', () => {
  cy.get('[data-testid="logout-button"]').click();
  cy.url().should('include', '/login');
});

// Create experiment command
Cypress.Commands.add('createExperiment', (experimentData) => {
  const defaultData = {
    name: 'Test Experiment',
    experiment_type: 'heart_rate',
    parameters: {
      duration_minutes: 2,
      baseline_bpm: 75
    }
  };
  
  const data = { ...defaultData, ...experimentData };
  
  cy.visit('/experiments');
  cy.get('[data-testid="create-experiment-button"]').click();
  cy.get('[data-testid="experiment-name-input"]').type(data.name);
  cy.get('[data-testid="experiment-type-select"]').select(data.experiment_type);
  
  // Fill parameters based on experiment type
  if (data.experiment_type === 'heart_rate') {
    cy.get('[data-testid="duration-input"]').clear().type(data.parameters.duration_minutes.toString());
    cy.get('[data-testid="baseline-bpm-input"]').clear().type(data.parameters.baseline_bpm.toString());
  }
  
  cy.get('[data-testid="run-experiment-button"]').click();
  
  // Wait for experiment to complete
  cy.get('[data-testid="experiment-status"]', { timeout: 15000 }).should('contain', 'completed');
});

// Mock API responses
Cypress.Commands.add('mockApiResponse', (method, url, response, statusCode = 200) => {
  cy.intercept(method, url, {
    statusCode,
    body: response
  });
});

// Mock authentication
Cypress.Commands.add('mockAuth', () => {
  const mockUser = {
    id: 'test-user-123',
    email: 'test@example.com',
    created_at: new Date().toISOString()
  };
  
  // Mock login response
  cy.mockApiResponse('POST', '**/auth/v1/token*', {
    access_token: 'mock-jwt-token',
    user: mockUser
  });
  
  // Mock user session
  cy.mockApiResponse('GET', '**/auth/v1/user', mockUser);
});

// Wait for loading to complete
Cypress.Commands.add('waitForLoading', () => {
  cy.get('[data-testid="loading-spinner"]').should('not.exist');
  cy.get('[data-testid="loading-skeleton"]').should('not.exist');
});

// Check accessibility
Cypress.Commands.add('checkA11y', () => {
  // Basic accessibility checks
  cy.get('img').each(($img) => {
    cy.wrap($img).should('have.attr', 'alt');
  });
  
  cy.get('button').each(($btn) => {
    cy.wrap($btn).should('be.visible');
  });
  
  cy.get('input').each(($input) => {
    cy.wrap($input).should('have.attr', 'aria-label').or('have.attr', 'placeholder');
  });
});

// Custom assertion for toast messages
Cypress.Commands.add('shouldShowToast', (message, type = 'success') => {
  cy.get('[data-testid="toast"]')
    .should('be.visible')
    .and('contain', message)
    .and('have.class', `toast-${type}`);
});

// Database cleanup (for integration tests)
Cypress.Commands.add('cleanupTestData', () => {
  // This would typically make API calls to clean up test data
  // For now, we'll just clear localStorage
  cy.clearLocalStorage();
  cy.clearCookies();
});