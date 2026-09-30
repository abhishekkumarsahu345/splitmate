  import { Routes, Route, Navigate } from 'react-router-dom'
  import ProtectedRoute from './components/ProtectedRoute.jsx'
  import LoginPage from './pages/LoginPage.jsx'
  import SignupPage from './pages/SignupPage.jsx'
  import DashboardPage from './pages/DashboardPage.jsx'
  import GroupsPage from './pages/GroupsPage.jsx'
  import GroupDetailPage from './pages/GroupDetailPage.jsx'
  import HistoryPage from './pages/HistoryPage.jsx'

  export default function App() {
    return (
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<SignupPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/groups/:id" element={<GroupDetailPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Route>

        {/* Default redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }
