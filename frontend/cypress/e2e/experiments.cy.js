describe('Experiments Page', () => {
  beforeEach(() => {
    cy.cleanupTestData();
    cy.mockAuth();
  });

  it('should display empty experiments state', () => {
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    cy.visit('/experiments');
    
    cy.get('[data-testid="experiments-page"]').should('be.visible');
    cy.get('[data-testid="empty-experiments"]').should('be.visible');
    cy.get('[data-testid="create-experiment-button"]').should('be.visible');
  });

  it('should display list of experiments', () => {
    const mockExperiments = [
      {
        id: 'exp-1',
        name: 'Heart Rate Test 1',
        experiment_type: 'heart_rate',
        status: 'completed',
        created_at: '2024-01-01T00:00:00Z',
        parameters: { duration_minutes: 5, baseline_bpm: 75 },
        results: {
          metrics: { mean: 78.5, std_dev: 5.2 },
          analysis_summary: 'Normal heart rate response'
        }
      },
      {
        id: 'exp-2',
        name: 'Reaction Time Test',
        experiment_type: 'reaction_time',
        status: 'completed',
        created_at: '2024-01-02T00:00:00Z',
        parameters: { trials: 10 },
        results: {
          metrics: { mean: 285.5, std_dev: 25.1 },
          analysis_summary: 'Average reaction time'
        }
      }
    ];

    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: mockExperiments,
      total: 2
    });

    cy.visit('/experiments');
    
    cy.get('[data-testid="experiment-card"]').should('have.length', 2);
    cy.get('[data-testid="experiment-card"]').first().should('contain', 'Heart Rate Test 1');
    cy.get('[data-testid="experiment-card"]').last().should('contain', 'Reaction Time Test');
  });

  it('should create a new heart rate experiment', () => {
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    const newExperiment = {
      id: 'new-exp-1',
      name: 'New Heart Rate Test',
      experiment_type: 'heart_rate',
      status: 'completed',
      created_at: new Date().toISOString(),
      parameters: { duration_minutes: 3, baseline_bpm: 70 }
    };

    cy.mockApiResponse('POST', '**/api/experiments*', {
      experiment: newExperiment,
      results: {
        id: 'result-1',
        experiment_id: 'new-exp-1',
        data_points: [
          { timestamp: 0, value: 72, metadata: { unit: 'bpm' } },
          { timestamp: 1, value: 74, metadata: { unit: 'bpm' } }
        ],
        metrics: { mean: 73.0, std_dev: 1.0, min: 72, max: 74 },
        analysis_summary: 'Heart rate experiment completed successfully'
      }
    });

    cy.visit('/experiments');
    
    cy.get('[data-testid="create-experiment-button"]').click();
    cy.get('[data-testid="experiment-form"]').should('be.visible');
    
    // Fill out the form
    cy.get('[data-testid="experiment-name-input"]').type('New Heart Rate Test');
    cy.get('[data-testid="experiment-type-select"]').select('heart_rate');
    cy.get('[data-testid="duration-input"]').clear().type('3');
    cy.get('[data-testid="baseline-bpm-input"]').clear().type('70');
    
    cy.get('[data-testid="run-experiment-button"]').click();
    
    // Should show success message
    cy.shouldShowToast('Experiment created and executed successfully', 'success');
    
    // Should show experiment results
    cy.get('[data-testid="experiment-results"]').should('be.visible');
    cy.get('[data-testid="results-summary"]').should('contain', 'Heart rate experiment completed successfully');
  });

  it('should create a reaction time experiment', () => {
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    const newExperiment = {
      id: 'new-exp-2',
      name: 'Reaction Time Test',
      experiment_type: 'reaction_time',
      status: 'completed',
      created_at: new Date().toISOString(),
      parameters: { trials: 5, stimulus_type: 'visual' }
    };

    cy.mockApiResponse('POST', '**/api/experiments*', {
      experiment: newExperiment,
      results: {
        id: 'result-2',
        experiment_id: 'new-exp-2',
        data_points: [
          { timestamp: 0, value: 250, metadata: { unit: 'ms', trial: 1, stimulus: 'visual' } },
          { timestamp: 1, value: 275, metadata: { unit: 'ms', trial: 2, stimulus: 'visual' } }
        ],
        metrics: { mean: 262.5, std_dev: 12.5, min: 250, max: 275 },
        analysis_summary: 'Reaction time within normal range'
      }
    });

    cy.visit('/experiments');
    
    cy.get('[data-testid="create-experiment-button"]').click();
    
    cy.get('[data-testid="experiment-name-input"]').type('Reaction Time Test');
    cy.get('[data-testid="experiment-type-select"]').select('reaction_time');
    cy.get('[data-testid="trials-input"]').clear().type('5');
    cy.get('[data-testid="stimulus-type-select"]').select('visual');
    
    cy.get('[data-testid="run-experiment-button"]').click();
    
    cy.shouldShowToast('Experiment created and executed successfully', 'success');
    cy.get('[data-testid="experiment-results"]').should('be.visible');
  });

  it('should validate form inputs', () => {
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    cy.visit('/experiments');
    cy.get('[data-testid="create-experiment-button"]').click();
    
    // Try to submit empty form
    cy.get('[data-testid="run-experiment-button"]').click();
    
    cy.get('[data-testid="name-error"]').should('contain', 'Experiment name is required');
    cy.get('[data-testid="type-error"]').should('contain', 'Please select an experiment type');
  });

  it('should handle experiment creation errors', () => {
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    cy.mockApiResponse('POST', '**/api/experiments*', {
      error: 'Failed to create experiment'
    }, 500);

    cy.visit('/experiments');
    cy.get('[data-testid="create-experiment-button"]').click();
    
    cy.get('[data-testid="experiment-name-input"]').type('Test Experiment');
    cy.get('[data-testid="experiment-type-select"]').select('heart_rate');
    cy.get('[data-testid="duration-input"]').clear().type('2');
    cy.get('[data-testid="baseline-bpm-input"]').clear().type('75');
    
    cy.get('[data-testid="run-experiment-button"]').click();
    
    cy.shouldShowToast('Failed to create experiment', 'error');
  });

  it('should filter experiments by type', () => {
    const mockExperiments = [
      {
        id: 'exp-1',
        name: 'Heart Rate Test',
        experiment_type: 'heart_rate',
        status: 'completed',
        created_at: '2024-01-01T00:00:00Z'
      },
      {
        id: 'exp-2',
        name: 'Memory Test',
        experiment_type: 'memory',
        status: 'completed',
        created_at: '2024-01-02T00:00:00Z'
      }
    ];

    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: mockExperiments,
      total: 2
    });

    // Mock filtered response
    cy.mockApiResponse('GET', '**/api/experiments?experiment_type=heart_rate*', {
      experiments: [mockExperiments[0]],
      total: 1
    });

    cy.visit('/experiments');
    
    cy.get('[data-testid="experiment-card"]').should('have.length', 2);
    
    // Apply filter
    cy.get('[data-testid="type-filter"]').select('heart_rate');
    
    cy.get('[data-testid="experiment-card"]').should('have.length', 1);
    cy.get('[data-testid="experiment-card"]').should('contain', 'Heart Rate Test');
  });

  it('should delete an experiment', () => {
    const mockExperiments = [
      {
        id: 'exp-1',
        name: 'Test Experiment',
        experiment_type: 'heart_rate',
        status: 'completed',
        created_at: '2024-01-01T00:00:00Z'
      }
    ];

    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: mockExperiments,
      total: 1
    });

    cy.mockApiResponse('DELETE', '**/api/experiments/exp-1*', {
      message: 'Experiment deleted successfully'
    });

    // Mock updated list after deletion
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    cy.visit('/experiments');
    
    cy.get('[data-testid="experiment-card"]').should('have.length', 1);
    cy.get('[data-testid="delete-experiment-button"]').click();
    
    // Confirm deletion
    cy.get('[data-testid="confirm-delete-button"]').click();
    
    cy.shouldShowToast('Experiment deleted successfully', 'success');
    cy.get('[data-testid="empty-experiments"]').should('be.visible');
  });

  it('should view experiment details', () => {
    const mockExperiment = {
      id: 'exp-1',
      name: 'Detailed Heart Rate Test',
      experiment_type: 'heart_rate',
      status: 'completed',
      created_at: '2024-01-01T00:00:00Z',
      parameters: { duration_minutes: 5, baseline_bpm: 75 },
      results: {
        id: 'result-1',
        data_points: [
          { timestamp: 0, value: 75, metadata: { unit: 'bpm' } },
          { timestamp: 1, value: 77, metadata: { unit: 'bpm' } },
          { timestamp: 2, value: 76, metadata: { unit: 'bpm' } }
        ],
        metrics: { mean: 76.0, std_dev: 1.0, min: 75, max: 77 },
        analysis_summary: 'Stable heart rate throughout the test'
      }
    };

    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [mockExperiment],
      total: 1
    });

    cy.mockApiResponse('GET', '**/api/experiments/exp-1*', mockExperiment);

    cy.visit('/experiments');
    
    cy.get('[data-testid="view-details-button"]').click();
    
    cy.get('[data-testid="experiment-details"]').should('be.visible');
    cy.get('[data-testid="experiment-name"]').should('contain', 'Detailed Heart Rate Test');
    cy.get('[data-testid="experiment-type"]').should('contain', 'heart_rate');
    cy.get('[data-testid="experiment-status"]').should('contain', 'completed');
    
    // Check results display
    cy.get('[data-testid="results-chart"]').should('be.visible');
    cy.get('[data-testid="metrics-summary"]').should('be.visible');
    cy.get('[data-testid="mean-value"]').should('contain', '76.0');
    cy.get('[data-testid="analysis-summary"]').should('contain', 'Stable heart rate throughout the test');
  });

  it('should be responsive on mobile devices', () => {
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    cy.viewport('iphone-6');
    cy.visit('/experiments');
    
    cy.get('[data-testid="experiments-page"]').should('be.visible');
    cy.get('[data-testid="mobile-create-button"]').should('be.visible');
  });

  it('should check accessibility', () => {
    cy.mockApiResponse('GET', '**/api/experiments*', {
      experiments: [],
      total: 0
    });

    cy.visit('/experiments');
    cy.checkA11y();
  });
});