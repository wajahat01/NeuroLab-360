import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataChart from '../DataChart';

// Mock Recharts components
jest.mock('recharts', () => ({
  LineChart: ({ children, data }) => (
    <div data-testid="line-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  AreaChart: ({ children, data }) => (
    <div data-testid="area-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  BarChart: ({ children, data }) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  PieChart: ({ children, data }) => (
    <div data-testid="pie-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Line: ({ dataKey, stroke }) => (
    <div data-testid="line" data-key={dataKey} data-stroke={stroke} />
  ),
  Area: ({ dataKey, stroke, fill }) => (
    <div data-testid="area" data-key={dataKey} data-stroke={stroke} data-fill={fill} />
  ),
  Bar: ({ dataKey, fill }) => (
    <div data-testid="bar" data-key={dataKey} data-fill={fill} />
  ),
  Pie: ({ dataKey, data }) => (
    <div data-testid="pie" data-key={dataKey} data-pie-data={JSON.stringify(data)} />
  ),
  Cell: ({ fill }) => <div data-testid="cell" data-fill={fill} />,
  XAxis: ({ dataKey }) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

describe('DataChart', () => {
  const mockData = [
    { date: '2024-01-01', value: 10 },
    { date: '2024-01-02', value: 20 },
    { date: '2024-01-03', value: 15 },
  ];

  it('renders line chart correctly', () => {
    render(
      <DataChart
        type="line"
        data={mockData}
        xKey="date"
        yKey="value"
        title="Test Line Chart"
      />
    );

    expect(screen.getByText('Test Line Chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders area chart correctly', () => {
    render(
      <DataChart
        type="area"
        data={mockData}
        xKey="date"
        yKey="value"
        title="Test Area Chart"
      />
    );

    expect(screen.getByText('Test Area Chart')).toBeInTheDocument();
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.getByTestId('area')).toBeInTheDocument();
  });

  it('renders bar chart correctly', () => {
    render(
      <DataChart
        type="bar"
        data={mockData}
        xKey="date"
        yKey="value"
        title="Test Bar Chart"
      />
    );

    expect(screen.getByText('Test Bar Chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar')).toBeInTheDocument();
  });

  it('renders pie chart correctly', () => {
    const pieData = [
      { name: 'Type A', value: 30 },
      { name: 'Type B', value: 70 },
    ];

    render(
      <DataChart
        type="pie"
        data={pieData}
        xKey="name"
        yKey="value"
        title="Test Pie Chart"
      />
    );

    expect(screen.getByText('Test Pie Chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie')).toBeInTheDocument();
  });

  it('renders multiline chart correctly', () => {
    const multiData = [
      { date: '2024-01-01', metric1: 10, metric2: 20 },
      { date: '2024-01-02', metric1: 15, metric2: 25 },
    ];

    render(
      <DataChart
        type="multiline"
        data={multiData}
        xKey="date"
        title="Test Multiline Chart"
      />
    );

    expect(screen.getByText('Test Multiline Chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    // Should render multiple lines for each metric
    expect(screen.getAllByTestId('line')).toHaveLength(2);
  });

  it('shows empty state when no data provided', () => {
    render(<DataChart type="line" data={[]} title="Empty Chart" />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('shows empty state when data is null', () => {
    render(<DataChart type="line" data={null} title="Null Data Chart" />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('applies custom styling props', () => {
    render(
      <DataChart
        type="line"
        data={mockData}
        xKey="date"
        yKey="value"
        color="#FF0000"
        showLegend={false}
        showGrid={false}
        className="custom-class"
      />
    );

    const chart = screen.getByTestId('line-chart');
    expect(chart).toBeInTheDocument();
    
    const line = screen.getByTestId('line');
    expect(line).toHaveAttribute('data-stroke', '#FF0000');
    
    // Legend and grid should not be present
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grid')).not.toBeInTheDocument();
  });

  it('renders without title when not provided', () => {
    render(
      <DataChart
        type="line"
        data={mockData}
        xKey="date"
        yKey="value"
      />
    );

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    // Should not have a title section
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('uses default props correctly', () => {
    render(<DataChart data={mockData} />);

    // Should default to line chart
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});