import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { lazy, Suspense, Component, type ReactNode } from 'react'
import { AuthProvider } from './hooks/useAuth'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const MapView = lazy(() => import('./pages/MapView'))
const Analysis = lazy(() => import('./pages/Analysis'))
const SeasonalAnalysis = lazy(() => import('./pages/SeasonalAnalysis'))
const Planning = lazy(() => import('./pages/Planning'))
const DataManagement = lazy(() => import('./pages/DataManagement'))
const Auth = lazy(() => import('./pages/Auth'))

function Loading() {
  return (
    <div className='flex items-center justify-center h-64 gap-3'>
      <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600' />
      <span className='text-gray-400'>加载中...</span>
    </div>
  )
}

function NotFound() {
  return (
    <div className='flex flex-col items-center justify-center h-96 text-center'>
      <div className='text-6xl mb-4'>🗺️</div>
      <h1 className='text-3xl font-bold text-gray-800 mb-2'>404</h1>
      <p className='text-gray-500 mb-6'>页面未找到</p>
      <a href='/' className='px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors'>
        返回首页
      </a>
    </div>
  )
}

interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { hasError: boolean; error: string }
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: '' }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className='flex flex-col items-center justify-center h-96 text-center'>
          <div className='text-5xl mb-4'>⚠️</div>
          <h2 className='text-xl font-bold text-gray-800 mb-2'>页面出错了</h2>
          <p className='text-sm text-gray-500 mb-4 max-w-md'>{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload() }}
            className='px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors'
          >
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
      <Suspense fallback={<Loading />}>
      <Routes>
        {/* 公开页面 */}
        <Route path='/auth' element={<Auth />} />
        <Route path='/' element={<Layout><Dashboard /></Layout>} />
        <Route path='/map' element={<Layout><MapView /></Layout>} />
        <Route path='/analysis' element={<Layout><Analysis /></Layout>} />
        <Route path='/seasonal' element={<Layout><SeasonalAnalysis /></Layout>} />

        {/* 受保护页面 */}
        <Route path='/planning' element={
          <ProtectedRoute allowedRoles={['admin', 'analyst']}>
            <Layout><Planning /></Layout>
          </ProtectedRoute>
        } />
        <Route path='/data' element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Layout><DataManagement /></Layout>
          </ProtectedRoute>
        } />
        <Route path='*' element={<NotFound />} />
        <Route path='*' element={<NotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  )
}

export default App
