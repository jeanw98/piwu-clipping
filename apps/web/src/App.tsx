import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/protected-route';
import { DashboardLayout } from '@/layouts/dashboard-layout';
import { LoginPage } from '@/pages/auth/login';
import { DashboardPage } from '@/pages/dashboard';
import { CreateClipPage } from '@/pages/dashboard/create';
import { ClipDetailPage } from '@/pages/dashboard/clip-detail';
import { ProjectsPage } from '@/pages/dashboard/projects';
import { ProjectDetailPage } from '@/pages/dashboard/project-detail';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/register" element={<Navigate to="/auth/login" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/create" element={<CreateClipPage />} />
          <Route path="/dashboard/clips/:id" element={<ClipDetailPage />} />
          <Route path="/dashboard/projects" element={<ProjectsPage />} />
          <Route path="/dashboard/projects/:id" element={<ProjectDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
