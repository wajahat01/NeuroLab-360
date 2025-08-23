import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DashboardSkeleton } from './LoadingSkeleton';

const ProtectedRoute = ({ children }) => {
  const { user, loading, initialized } = useAuth();
  
  // Show skeleton loading state while authentication is being determined
  // This prevents flash of login page before auth check completes
  if (!initialized || loading) {
    return (
      <div className="fade-in" data-testid="loading-state">
        <DashboardSkeleton />
      </div>
    );
  }
  
  // Only redirect after authentication state is fully initialized
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Render children with smooth transition
  return (
    <div className="fade-in" data-testid="protected-content">
      {children}
    </div>
  );
};

export default ProtectedRoute;