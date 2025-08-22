import React, { useState } from 'react';
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
  useDashboardSummary, 
  useDashboardCharts, 
  useRecentExperiments 
} from '../hooks/useDashboard';

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  
  const { 
    data: summaryData, 
    loading: summaryLoading, 
    error: summaryError, 
    refetch: refetchSummary 
  } = useDashboardSummary();
  
  const { 
    data: chartsData, 
    loading: chartsLoading, 
    error: chartsError, 
    refetch: refetchCharts 
  } = useDashboardCharts(selectedPeriod);
  
  const { 
    data: recentData, 
    loading: recentLoading, 
    error: recentError, 
    refetch: refetchRecent 
  } = useRecentExperiments(5, 7);

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
  };

  const handleRetryAll = () => {
    refetchSummary();
    refetchCharts();
    refetchRecent();
  };

  // Show loading skeleton while initial data loads
  if (summaryLoading && chartsLoading && recentLoading) {
    return <DashboardSkeleton />;
  }

  // Show error if all requests failed
  if (summaryError && chartsError && recentError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Welcome to NeuroLab 360 - Your neurological experiment platform
          </p>
        </div>
        <ErrorDisplay 
          error="Failed to load dashboard data" 
          onRetry={handleRetryAll}
          title="Dashboard Unavailable"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome to NeuroLab 360 - Your neurological experiment platform
        </p>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryLoading ? (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        ) : summaryError ? (
          <div className="col-span-full">
            <ErrorDisplay 
              error={summaryError} 
              onRetry={refetchSummary}
              title="Failed to load summary"
              showRetry={true}
            />
          </div>
        ) : summaryData ? (
          <>
            <StatCard
              title="Total Experiments"
              value={summaryData.total_experiments}
              icon="🧪"
              color="blue"
            />
            <StatCard
              title="Completion Rate"
              value={`${summaryData.recent_activity?.completion_rate || 0}%`}
              icon="✅"
              color="green"
            />
            <StatCard
              title="Recent Activity"
              value={summaryData.recent_activity?.last_7_days || 0}
              subtitle="Last 7 days"
              icon="📈"
              color="purple"
            />
            <StatCard
              title="Experiment Types"
              value={Object.keys(summaryData.experiments_by_type || {}).length}
              icon="🔬"
              color="orange"
            />
          </>
        ) : (
          <div className="col-span-full">
            <EmptyState 
              title="No experiment data"
              description="Start by running your first experiment to see dashboard statistics."
              action={() => navigate('/experiments')}
              actionLabel="Create Experiment"
            />
          </div>
        )}
      </div>

      {/* Period Selector */}
      {!summaryError && summaryData && (
        <div className="flex justify-end">
          <div className="inline-flex rounded-md shadow-sm" role="group">
            {[
              { value: '7d', label: '7 Days' },
              { value: '30d', label: '30 Days' },
              { value: '90d', label: '90 Days' },
              { value: 'all', label: 'All Time' }
            ].map((period) => (
              <button
                key={period.value}
                onClick={() => handlePeriodChange(period.value)}
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
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Timeline Chart */}
        <div>
          {chartsLoading ? (
            <ChartSkeleton height={300} />
          ) : chartsError ? (
            <ErrorDisplay 
              error={chartsError} 
              onRetry={refetchCharts}
              title="Failed to load activity chart"
            />
          ) : chartsData?.activity_timeline ? (
            <DataChart
              type="area"
              data={chartsData.activity_timeline}
              xKey="date"
              yKey="count"
              title="Experiment Activity"
              height={300}
              color="#3B82F6"
            />
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Experiment Activity</h3>
              <EmptyState 
                title="No activity data"
                description="Run some experiments to see your activity timeline."
              />
            </div>
          )}
        </div>

        {/* Experiment Type Distribution */}
        <div>
          {chartsLoading ? (
            <ChartSkeleton height={300} />
          ) : chartsError ? (
            <ErrorDisplay 
              error={chartsError} 
              onRetry={refetchCharts}
              title="Failed to load distribution chart"
            />
          ) : chartsData?.experiment_type_distribution ? (
            <DataChart
              type="pie"
              data={chartsData.experiment_type_distribution.map(item => ({
                name: item.type,
                value: item.count
              }))}
              xKey="name"
              yKey="value"
              title="Experiment Types"
              height={300}
            />
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Experiment Types</h3>
              <EmptyState 
                title="No type data"
                description="Run experiments to see type distribution."
              />
            </div>
          )}
        </div>
      </div>

      {/* Performance Trends Chart */}
      {chartsData?.performance_trends && chartsData.performance_trends.length > 0 && (
        <div>
          <DataChart
            type="multiline"
            data={chartsData.performance_trends}
            xKey="date"
            title="Performance Trends"
            height={300}
            showLegend={true}
          />
        </div>
      )}

      {/* Recent Experiments and Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Experiments */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Recent Experiments</h3>
            </div>
            <div className="p-6">
              {recentLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : recentError ? (
                <ErrorDisplay 
                  error={recentError} 
                  onRetry={refetchRecent}
                  title="Failed to load recent experiments"
                />
              ) : recentData?.experiments && recentData.experiments.length > 0 ? (
                <div className="space-y-4">
                  {recentData.experiments.map((experiment) => (
                    <ExperimentItem key={experiment.id} experiment={experiment} />
                  ))}
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={() => navigate('/experiments')}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View all experiments →
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState 
                  title="No recent experiments"
                  description="Start running experiments to see them here."
                  action={() => navigate('/experiments')}
                  actionLabel="Create Experiment"
                />
              )}
            </div>
          </div>
        </div>

        {/* Insights Panel */}
        <div>
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Insights</h3>
            </div>
            <div className="p-6">
              {recentLoading ? (
                <div className="space-y-4">
                  {[...Array(2)].map((_, i) => (
                    <InsightCardSkeleton key={i} />
                  ))}
                </div>
              ) : recentData?.insights && recentData.insights.length > 0 ? (
                <div className="space-y-4">
                  {recentData.insights.map((insight, index) => (
                    <InsightCard key={index} insight={insight} />
                  ))}
                </div>
              ) : (
                <EmptyState 
                  title="No insights yet"
                  description="Complete more experiments to get personalized insights."
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper Components
const StatCard = ({ title, value, subtitle, icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600',
    red: 'text-red-600'
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <span className="text-2xl">{icon}</span>
        </div>
        <div className="ml-4 flex-1">
          <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
          <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

const ExperimentItem = ({ experiment }) => {
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
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <h4 className="text-sm font-medium text-gray-900">{experiment.name}</h4>
        <p className="text-xs text-gray-500">
          {experiment.experiment_type} • {formatDate(experiment.created_at)}
        </p>
      </div>
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(experiment.status)}`}>
        {experiment.status}
      </span>
    </div>
  );
};

const InsightCard = ({ insight }) => {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start space-x-3">
        <span className="text-lg flex-shrink-0">{insight.icon}</span>
        <div className="flex-1">
          <p className="text-sm text-blue-800 font-medium">{insight.message}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;