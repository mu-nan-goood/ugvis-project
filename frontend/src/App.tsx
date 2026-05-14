import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './hooks/useAuth'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const MapView = lazy(() => import('./pages/MapView'))
const Analysis = lazy(() => import('./pages/Analysis'))
const SeasonalAnalysis = lazy(() => import('./pages/SeasonalAnalysis'))
const Planning = lazy(() => import('./pages/Planning'))
const DataManagement = lazy(() => import('./pages/DataManagement'))
const Auth = lazy(() => import('./pages/Auth'))

function Loading() {
  return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Loading...</p></div>
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* 公开页面 */}
        <Route path="/auth" element={
          <Suspense fallback={<Loading />}>
            <Auth />
          </Suspense>
        } />
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/map" element={<Layout><MapView /></Layout>} />
        <Route path="/analysis" element={<Layout><Analysis /></Layout>} />
        <Route path="/seasonal" element={<Layout><SeasonalAnalysis /></Layout>} />

        {/* 受保护页面 */}
        <Route path="/planning" element={
          <ProtectedRoute allowedRoles={['admin', 'analyst']}>
            <Layout><Planning /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/data" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Layout><DataManagement /></Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </AuthProvider>
  )
}

export default App
