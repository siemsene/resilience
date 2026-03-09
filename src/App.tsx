import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { LandingPage } from './components/landing/LandingPage';
import { AdminPage } from './components/admin/AdminPage';
import { InstructorPage } from './components/instructor/InstructorPage';
import { GamePage } from './components/game/GamePage';
import { ResultsPage } from './components/results/ResultsPage';
import s from './styles/shared.module.css';
import './styles/theme.css';

function ProtectedRoute({ children, requireAdmin, requireInstructor }: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireInstructor?: boolean;
}) {
  const { user, loading, isAdmin, isInstructor, instructorStatus } = useAuth();

  if (loading) {
    return <div className={s.loadingPage}><div className={s.spinner} /> Loading...</div>;
  }

  if (!user) return <Navigate to="/" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  if (requireInstructor && !isInstructor) {
    if (instructorStatus === 'pending') {
      return (
        <div className={s.pageContainer}>
          <div className={s.card} style={{ textAlign: 'center', marginTop: '80px' }}>
            <h2>Application Pending</h2>
            <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>
              Your instructor application is under review. You'll receive an email when it's approved.
            </p>
          </div>
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin" element={
        <ProtectedRoute requireAdmin>
          <AdminPage />
        </ProtectedRoute>
      } />
      <Route path="/instructor" element={
        <ProtectedRoute requireInstructor>
          <InstructorPage />
        </ProtectedRoute>
      } />
      <Route path="/game" element={<GamePage />} />
      <Route path="/results/:sessionId" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GameProvider>
          <AppRoutes />
        </GameProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
