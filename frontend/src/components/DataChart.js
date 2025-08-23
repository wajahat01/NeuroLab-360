import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

/** Color palette for chart elements */
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

/**
 * Versatile data visualization component supporting multiple chart types.
 * Built with Recharts library for responsive and interactive charts.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.type='line'] - Chart type: 'line', 'area', 'bar', 'pie', 'multiline'
 * @param {Array} [props.data=[]] - Array of data objects to visualize
 * @param {string} [props.xKey='date'] - Key for X-axis data in data objects
 * @param {string} [props.yKey='value'] - Key for Y-axis data in data objects
 * @param {string} [props.title] - Optional chart title displayed above the chart
 * @param {number} [props.height=300] - Height of the chart in pixels
 * @param {boolean} [props.showLegend=true] - Whether to display chart legend
 * @param {boolean} [props.showGrid=true] - Whether to display grid lines
 * @param {string} [props.color='#3B82F6'] - Primary color for single-series charts
 * @param {string} [props.className=''] - Additional CSS classes for styling
 * @returns {JSX.Element} Rendered chart component
 * 
 * @example
 * // Line chart with experiment data
 * <DataChart
 *   type="line"
 *   data={experimentData}
 *   xKey="timestamp"
 *   yKey="amplitude"
 *   title="EEG Signal Over Time"
 *   height={400}
 * />
 * 
 * @example
 * // Pie chart for experiment type distribution
 * <DataChart
 *   type="pie"
 *   data={typeDistribution}
 *   xKey="type"
 *   yKey="count"
 *   title="Experiment Types"
 * />
 */
const DataChart = ({ 
  type = 'line', 
  data = [], 
  xKey = 'date', 
  yKey = 'value',
  title,
  height = 300,
  showLegend = true,
  showGrid = true,
  color = '#3B82F6',
  className = ''
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-${height/4} bg-gray-50 rounded-lg ${className}`}>
        <div className="text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No data available</p>
        </div>
      </div>
    );
  }

  /**
   * Renders the appropriate chart component based on the type prop.
   * Handles different chart configurations and styling options.
   * 
   * @returns {JSX.Element|null} The rendered chart component or null for invalid types
   */
  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (type) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            {showLegend && <Legend />}
            <Line 
              type="monotone" 
              dataKey={yKey} 
              stroke={color} 
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            {showLegend && <Legend />}
            <Area 
              type="monotone" 
              dataKey={yKey} 
              stroke={color} 
              fill={color}
              fillOpacity={0.3}
            />
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            {showLegend && <Legend />}
            <Bar dataKey={yKey} fill={color} />
          </BarChart>
        );

      case 'pie':
        return (
          <PieChart {...commonProps}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey={yKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        );

      case 'multiline':
        // For multiple metrics on the same chart
        const metrics = data.length > 0 ? Object.keys(data[0]).filter(key => key !== xKey) : [];
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            {showLegend && <Legend />}
            {metrics.map((metric, index) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ strokeWidth: 2, r: 3 }}
              />
            ))}
          </LineChart>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        </div>
      )}
      <div className="p-6">
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DataChart;