import React from 'react';

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome to NeuroLab 360 - Your neurological experiment platform
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Total Experiments
            </h3>
            <p className="text-3xl font-bold text-primary-600">0</p>
            <p className="text-sm text-gray-500 mt-1">
              Dashboard functionality will be implemented in task 9
            </p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Recent Results
            </h3>
            <p className="text-3xl font-bold text-success-600">0</p>
            <p className="text-sm text-gray-500 mt-1">
              Data visualization coming soon
            </p>
          </div>
        </div>
        
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Success Rate
            </h3>
            <p className="text-3xl font-bold text-warning-600">--</p>
            <p className="text-sm text-gray-500 mt-1">
              Analytics will be available soon
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;