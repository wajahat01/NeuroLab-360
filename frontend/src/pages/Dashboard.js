import React, { useState, memo, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  DataChart, 
  ErrorDisplay, 
  EmptyState,
  DashboardSkeleton,
  StatCardSkeleton,
  ChartSkeleton,
  InsightCardSkeleton
} from '../components';
import { 
  DashboardTransition, 
  StaggeredContainer, 
  FadeTransition 
} from '../components/SmoothTransition';
import { useOptimizedDashboardData } from '../hooks/useOptimizedDataFetching';
import { useEnhancedErrorHandling } from '../hooks/useEnhancedErrorHandling';
import { useCachePreloader } from '../hooks/useEnhancedCache';
import { useEntranceAnimations } from '../hooks/useAnimations';
import { DashboardPerformanceMonitor, LoginTransitionTracker } from '../components/PerformanceMonitor';
import { usePerformanceTracking } from '../utils/performanceMonitor';

const Dashboard = memo(() => {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  
  // Performance tracking
  const { startTransition } = usePerformanceTracking('Dashboard');
  
  // Use optimized data fetching with coordinated loading states
  const {
    summary,
    charts,
    recent,
    isInitialLoading,
    isValidating,
    hasAllErrors,
    hasStaleData,
    refetchAll,
    preloadAll
  } = useOptimizedDashboardData();

  // Enhanced error handling to prevent visual disruptions
  const {
    error: globalError,
    showErrorUI,
    handleError,
    clearError,
    retry
  } = useEnhancedErrorHandling({
    showToasts: true,
    retainDataOnError: true,
    errorDisplayDelay: 500,
    autoRetry: true,
    maxRetries: 2
  });

  // Cache preloader for better performance
  const { preloadDashboardData } = useCachePreloader();

  // Coordinate entrance animations
  const { isReady, shouldAnimate } = useEntranceAnimations([
    summary.data, 
    charts.data, 
    recent.data
  ]);

  // Preload dashboard data on mount for better performance
  useEffect(() => {
    const dashboardLoadTracker = startTransition('dashboard-load');
    preloadAll();
    dashboardLoadTracker.end();
  }, [preloadAll, startTransition]);

  // Handle errors gracefully without visual disruptions
  useEffect(() => {
    if (summary.error || charts.error || recent.error) {
      const primaryError = summary.error || charts.error || recent.error;
      handleError(new Error(primaryError), {
        retryCallback: () => Promise.resolve(refetchAll()),
        silent: false
      });
    } else {
      clearError();
    }
  }, [summary.error, charts.error, recent.error, handleError, clearError, refetchAll]);

  // Memoized callback functions to prevent child re-renders
  const handlePeriodChange = useCallback((period) => {
    setSelectedPeriod(period);
  }, []);

  const handleRetryAll = useCallback(() => {
    clearError();
    refetchAll();
  }, [clearError, refetchAll]);

  const handleNavigateToExperiments = useCallback(() => {
    navigate('/experiments');
  }, [navigate]);

  // Memoized period options to prevent recreation on every render
  const periodOptions = useMemo(() => [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'all', label: 'All Time' }
  ], []);

  // Show loading skeleton while initial data loads
  if (isInitialLoading) {
    return <DashboardSkeleton />;
  }

  // Show error if all requests failed and error UI should be displayed
  if (hasAllErrors && showErrorUI) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Welcome to NeuroLab 360 - Your neurological experiment platform
          </p>
        </div>
        <ErrorDisplay 
          error={globalError || "Failed to load dashboard data"} 
          onRetry={handleRetryAll}
          title="Dashboard Unavailable"
        />
      </div>
    );
  }

  return (
    <DashboardPerformanceMonitor>
      <div className="dashboard-content prevent-layout-shift" data-testid="dashboard-container">
      {/* Header with validation indicator */}
      <DashboardTransition section="header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-gray-600">
              Welcome to NeuroLab 360 - Your neurological experiment platform
            </p>
          </div>
          {(isValidating || hasStaleData) && (
            <FadeTransition delay={300}>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Updating data...</span>
              </div>
            </FadeTransition>
          )}
        </div>
      </DashboardTransition>

      {/* Summary Stats Cards */}
      <div className="dashboard-stats-grid">
        {summary.loading && !summary.data ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : summary.error && showErrorUI && !summary.data ? (
          <div className="col-span-full">
            <FadeTransition delay={200}>
              <ErrorDisplay 
                error={summary.error} 
                onRetry={() => summary.refetch()}
                title="Failed to load summary"
                showRetry={true}
              />
            </FadeTransition>
          </div>
        ) : summary.data ? (
          <StaggeredContainer 
            staggerDelay={100} 
            baseDelay={100}
            className="contents"
          >
            <StatCard
              title="Total Experiments"
              value={summary.data.total_experiments}
              icon="🧪"
              color="blue"
              isStale={summary.isStale}
            />
            <StatCard
              title="Completion Rate"
              value={`${summary.data.recent_activity?.completion_rate || 0}%`}
              icon="✅"
              color="green"
              isStale={summary.isStale}
            />
            <StatCard
              title="Recent Activity"
              value={summary.data.recent_activity?.last_7_days || 0}
              subtitle="Last 7 days"
              icon="📈"
              color="purple"
              isStale={summary.isStale}
            />
            <StatCard
              title="Experiment Types"
              value={Object.keys(summary.data.experiments_by_type || {}).length}
              icon="🔬"
              color="orange"
              isStale={summary.isStale}
            />
          </StaggeredContainer>
        ) : (
          <div className="col-span-full">
            <FadeTransition delay={200}>
              <EmptyState 
                title="No experiment data"
                description="Start by running your first experiment to see dashboard statistics."
                action={handleNavigateToExperiments}
                actionLabel="Create Experiment"
              />
            </FadeTransition>
          </div>
        )}
      </div>

      {/* Period Selector */}
      <div className="dashboard-period-selector">
        {!summary.error && summary.data && (
          <FadeTransition delay={400}>
            <PeriodSelector 
              selectedPeriod={selectedPeriod}
              periodOptions={periodOptions}
              onPeriodChange={handlePeriodChange}
            />
          </FadeTransition>
        )}
      </div>

      {/* Charts Section */}
      <div className="dashboard-charts-grid">
        {/* Activity Timeline Chart */}
        <DashboardTransition section="charts" index={0}>
          <div className="dashboard-chart-card">
            {charts.loading && !charts.data ? (
              <ChartSkeleton height={300} />
            ) : charts.error && showErrorUI && !charts.data ? (
              <ErrorDisplay 
                error={charts.error} 
                onRetry={() => charts.refetch()}
                title="Failed to load activity chart"
              />
            ) : charts.data?.activity_timeline ? (
              <DataChart
                type="area"
                data={charts.data.activity_timeline}
                xKey="date"
                yKey="count"
                title="Experiment Activity"
                height={300}
                color="#3B82F6"
                isStale={charts.isStale}
              />
            ) : (
              <div className="stable-dimensions">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Experiment Activity</h3>
                <EmptyState 
                  title="No activity data"
                  description="Run some experiments to see your activity timeline."
                />
              </div>
            )}
          </div>
        </DashboardTransition>

        {/* Experiment Type Distribution */}
        <DashboardTransition section="charts" index={1}>
          <div className="dashboard-chart-card">
            {charts.loading && !charts.data ? (
              <ChartSkeleton height={300} />
            ) : charts.error && showErrorUI && !charts.data ? (
              <ErrorDisplay 
                error={charts.error} 
                onRetry={() => charts.refetch()}
                title="Failed to load distribution chart"
              />
            ) : charts.data?.experiment_type_distribution ? (
              <DataChart
                type="pie"
                data={charts.data.experiment_type_distribution.map(item => ({
                  name: item.type,
                  value: item.count
                }))}
                xKey="name"
                yKey="value"
                title="Experiment Types"
                height={300}
                isStale={charts.isStale}
              />
            ) : (
              <div className="stable-dimensions">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Experiment Types</h3>
                <EmptyState 
                  title="No type data"
                  description="Run experiments to see type distribution."
                />
              </div>
            )}
          </div>
        </DashboardTransition>
      </div>

      {/* Performance Trends Chart */}
      {charts.data?.performance_trends && charts.data.performance_trends.length > 0 && (
        <FadeTransition delay={600}>
          <div className="dashboard-performance-chart">
            <DataChart
              type="multiline"
              data={charts.data.performance_trends}
              xKey="date"
              title="Performance Trends"
              height={300}
              showLegend={true}
              isStale={charts.isStale}
            />
          </div>
        </FadeTransition>
      )}

      {/* Recent Experiments and Insights */}
      <div className="dashboard-bottom-grid">
        {/* Recent Experiments */}
        <div className="lg:col-span-2">
          <DashboardTransition section="content" delay={700}>
            <div className="dashboard-experiments-card">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Recent Experiments</h3>
              </div>
              <div className="p-6 stable-dimensions">
                {recent.loading && !recent.data ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : recent.error && showErrorUI && !recent.data ? (
                  <ErrorDisplay 
                    error={recent.error} 
                    onRetry={() => recent.refetch()}
                    title="Failed to load recent experiments"
                  />
                ) : recent.data?.experiments && recent.data.experiments.length > 0 ? (
                  <div className="space-y-4">
                    <StaggeredContainer 
                      staggerDelay={50} 
                      baseDelay={100}
                      className="space-y-4"
                    >
                      {recent.data.experiments.map((experiment) => (
                        <ExperimentItem 
                          key={experiment.id} 
                          experiment={experiment} 
                          isStale={recent.isStale}
                        />
                      ))}
                    </StaggeredContainer>
                    <FadeTransition delay={400}>
                      <div className="pt-4 border-t border-gray-200">
                        <button
                          onClick={handleNavigateToExperiments}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors duration-200"
                        >
                          View all experiments →
                        </button>
                      </div>
                    </FadeTransition>
                  </div>
                ) : (
                  <EmptyState 
                    title="No recent experiments"
                    description="Start running experiments to see them here."
                    action={handleNavigateToExperiments}
                    actionLabel="Create Experiment"
                  />
                )}
              </div>
            </div>
          </DashboardTransition>
        </div>

        {/* Insights Panel */}
        <div>
          <DashboardTransition section="content" delay={800}>
            <div className="dashboard-insights-card">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Insights</h3>
              </div>
              <div className="p-6 stable-dimensions">
                {recent.loading && !recent.data ? (
                  <div className="space-y-4">
                    {[...Array(2)].map((_, i) => (
                      <InsightCardSkeleton key={i} />
                    ))}
                  </div>
                ) : recent.data?.insights && recent.data.insights.length > 0 ? (
                  <StaggeredContainer 
                    staggerDelay={100} 
                    baseDelay={200}
                    className="space-y-4"
                  >
                    {recent.data.insights.map((insight, index) => (
                      <InsightCard 
                        key={index} 
                        insight={insight} 
                        isStale={recent.isStale}
                      />
                    ))}
                  </StaggeredContainer>
                ) : (
                  <EmptyState 
                    title="No insights yet"
                    description="Complete more experiments to get personalized insights."
                  />
                )}
              </div>
            </div>
          </DashboardTransition>
        </div>
      </div>
    </div>
    </DashboardPerformanceMonitor>
  );
});

// Memoized Period Selector component
const PeriodSelector = memo(({ selectedPeriod, periodOptions, onPeriodChange }) => (
  <div className="flex justify-end">
    <div className="inline-flex rounded-md shadow-sm" role="group">
      {periodOptions.map((period) => (
        <button
          key={period.value}
          onClick={() => onPeriodChange(period.value)}
          className={`px-4 py-2 text-sm font-medium border ${
            selectedPeriod === period.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          } ${
            period.value === '7d' ? 'rounded-l-md' : 
            period.value === 'all' ? 'rounded-r-md' : ''
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
        >
          {period.label}
        </button>
      ))}
    </div>
  </div>
));

// Helper Components
const StatCard = memo(({ title, value, subtitle, icon, color = 'blue', isStale = false }) => {
  const colorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600',
    red: 'text-red-600'
  };

  return (
    <div className={`dashboard-stat-card stable-dimensions ${isStale ? 'opacity-75' : ''}`}>
      <div className="flex items-center w-full">
        <div className="flex-shrink-0">
          <span className="text-2xl">{icon}</span>
        </div>
        <div className="ml-4 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
            {isStale && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                Updating...
              </span>
            )}
          </div>
          <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
});

const ExperimentItem = memo(({ experiment, isStale = false }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown date';
    }
  };

  return (
    <div className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg ${isStale ? 'opacity-75' : ''}`}>
      <div className="flex-1">
        <h4 className="text-sm font-medium text-gray-900">{experiment.name}</h4>
        <p className="text-xs text-gray-500">
          {experiment.experiment_type} • {formatDate(experiment.created_at)}
        </p>
      </div>
      <div className="flex items-center space-x-2">
        {isStale && (
          <span className="text-xs text-gray-400">Updating...</span>
        )}
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(experiment.status)}`}>
          {experiment.status}
        </span>
      </div>
    </div>
  );
});

const InsightCard = memo(({ insight, isStale = false }) => {
  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${isStale ? 'opacity-75' : ''}`}>
      <div className="flex items-start space-x-3">
        <span className="text-lg flex-shrink-0">{insight.icon}</span>
        <div className="flex-1">
          <p className="text-sm text-blue-800 font-medium">{insight.message}</p>
          {isStale && (
            <p className="text-xs text-blue-600 mt-1">Updating insights...</p>
          )}
        </div>
      </div>
    </div>
  );
});

export default Dashboard;