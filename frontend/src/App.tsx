import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import MapView from './pages/MapView'
import Analysis from './pages/Analysis'
import SeasonalAnalysis from './pages/SeasonalAnalysis'
import Planning from './pages/Planning'
import DataManagement from './pages/DataManagement'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/seasonal" element={<SeasonalAnalysis />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/data" element={<DataManagement />} />
      </Routes>
    </Layout>
  )
}

export default App
