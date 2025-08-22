import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-spinner">
        <LoadingSpinner />
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" replace />;
};

export default ProtectedRoute;