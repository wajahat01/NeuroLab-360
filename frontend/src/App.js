import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Experiments from './pages/Experiments';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardErrorBoundary from './components/DashboardErrorBoundary';
import ToastProvider from './components/ToastProvider';
import { NotFoundPage } from './pages/ErrorPages';
import { AuthProvider } from './contexts/AuthContext';
import { AppPerformanceMonitor } from './components/PerformanceMonitor';

// Layout component for authenticated pages
const AuthenticatedLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar />
      <main className="container mx-auto px-responsive py-responsive max-w-7xl">
        <div className="animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
      <AppPerformanceMonitor>
        <AuthProvider>
          <ToastProvider>
            <Router
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true
              }}
            >
              <div className="App">
                <Toaster 
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: '#363636',
                      color: '#fff',
                    },
                  }}
                />
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route 
                    path="/dashboard" 
                    element={
                      <ProtectedRoute>
                        <AuthenticatedLayout>
                          <DashboardErrorBoundary>
                            <Dashboard />
                          </DashboardErrorBoundary>
                        </AuthenticatedLayout>
                      </ProtectedRoute>
                    } 
                  />
                  <Route 
                    path="/experiments" 
                    element={
                      <ProtectedRoute>
                        <AuthenticatedLayout>
                          <ErrorBoundary>
                            <Experiments />
                          </ErrorBoundary>
                        </AuthenticatedLayout>
                      </ProtectedRoute>
                    } 
                  />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </div>
            </Router>
          </ToastProvider>
        </AuthProvider>
      </AppPerformanceMonitor>
    </ErrorBoundary>
  );
}

export default App;