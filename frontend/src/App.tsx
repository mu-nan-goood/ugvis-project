import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { lazy, Suspense } from 'react'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const MapView = lazy(() => import('./pages/MapView'))
const Analysis = lazy(() => import('./pages/Analysis'))
const SeasonalAnalysis = lazy(() => import('./pages/SeasonalAnalysis'))
const Planning = lazy(() => import('./pages/Planning'))
const DataManagement = lazy(() => import('./pages/DataManagement'))

function Loading() {
  return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Loading...</p></div>
}

function App() {
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/seasonal" element={<SeasonalAnalysis />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/data" element={<DataManagement />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
