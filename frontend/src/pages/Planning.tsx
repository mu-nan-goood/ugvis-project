import { useState, useEffect } from 'react'
import { fetchPlanningWeakAreas } from '../utils/api'

interface WeakArea {
  id: number
  point_id: number
  lat: number
  lng: number
  gvi_winter: number | null
  gvi_spring: number | null
  gvi_summer: number | null
  gvi_autumn: number | null
  road_type: string | null
  priority: string
  suggestion: string
}

interface PlanningStats {
  high_priority: number
  medium_priority: number
  low_priority: number
  estimated_trees: number
  estimated_gvi_improvement: number
}

const ROAD_TYPE_LABELS: Record<string, string> = {
  rc1: '快速路',
  rc2: '主干路',
  rc3: '次干路',
  rc4: '支路',
}

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '高', color: 'text-red-700', bg: 'bg-red-50' },
  medium: { label: '中', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  low: { label: '低', color: 'text-green-700', bg: 'bg-green-50' },
}

export default function Planning() {
  const [stats, setStats] = useState<PlanningStats | null>(null)
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterRoadType, setFilterRoadType] = useState<string>('all')

  useEffect(() => {
    fetchPlanningWeakAreas()
      .then((data) => {
        setStats(data.stats || null)
        setWeakAreas(data.weak_areas || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card bg-red-50 border-red-200">
        <p className="text-red-600">加载失败: {error}</p>
      </div>
    )
  }

  const filteredAreas = weakAreas.filter((area) => {
    const matchPriority = filterPriority === 'all' || area.priority === filterPriority
    const matchRoad = filterRoadType === 'all' || area.road_type === filterRoadType
    return matchPriority && matchRoad
  })

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">规划决策支持</h2>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card border-l-4 border-red-500">
            <h3 className="text-sm text-gray-500">高优先级区域</h3>
            <p className="text-2xl font-bold text-red-600">{stats.high_priority.toLocaleString()}</p>
            <p className="text-xs text-gray-400">冬季GVI &lt; 3%</p>
          </div>
          <div className="card border-l-4 border-yellow-500">
            <h3 className="text-sm text-gray-500">中优先级区域</h3>
            <p className="text-2xl font-bold text-yellow-600">{stats.medium_priority.toLocaleString()}</p>
            <p className="text-xs text-gray-400">冬季GVI 3-6%</p>
          </div>
          <div className="card border-l-4 border-green-500">
            <h3 className="text-sm text-gray-500">低优先级区域</h3>
            <p className="text-2xl font-bold text-green-600">{stats.low_priority.toLocaleString()}</p>
            <p className="text-xs text-gray-400">冬季GVI 6-10%</p>
          </div>
          <div className="card border-l-4 border-blue-500">
            <h3 className="text-sm text-gray-500">预估需补植树苗</h3>
            <p className="text-2xl font-bold text-blue-600">{stats.estimated_trees.toLocaleString()}</p>
            <p className="text-xs text-gray-400">按高3棵/中2棵估算</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="text-sm text-gray-500 mr-2">优先级:</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="border rounded-lg px-3 py-1 text-sm"
          >
            <option value="all">全部</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-500 mr-2">道路类型:</label>
          <select
            value={filterRoadType}
            onChange={(e) => setFilterRoadType(e.target.value)}
            className="border rounded-lg px-3 py-1 text-sm"
          >
            <option value="all">全部</option>
            <option value="rc1">快速路</option>
            <option value="rc2">主干路</option>
            <option value="rc3">次干路</option>
            <option value="rc4">支路</option>
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          显示 {filteredAreas.length} / {weakAreas.length} 条
        </div>
      </div>

      {/* Weak Areas Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white shadow-sm">
              <tr className="border-b">
                <th className="text-left py-3 px-4">ID</th>
                <th className="text-left py-3 px-4">坐标</th>
                <th className="text-right py-3 px-4">冬GVI</th>
                <th className="text-right py-3 px-4">春GVI</th>
                <th className="text-right py-3 px-4">夏GVI</th>
                <th className="text-right py-3 px-4">秋GVI</th>
                <th className="text-left py-3 px-4">道路类型</th>
                <th className="text-center py-3 px-4">优先级</th>
                <th className="text-left py-3 px-4">改造建议</th>
              </tr>
            </thead>
            <tbody>
              {filteredAreas.map((area) => {
                const p = PRIORITY_LABELS[area.priority] || PRIORITY_LABELS.low
                return (
                  <tr key={area.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">{area.point_id}</td>
                    <td className="py-2 px-4 text-xs text-gray-500">
                      {area.lat.toFixed(4)},{area.lng.toFixed(4)}
                    </td>
                    <td className="text-right py-2 px-4">{area.gvi_winter?.toFixed(1) ?? '-'}</td>
                    <td className="text-right py-2 px-4">{area.gvi_spring?.toFixed(1) ?? '-'}</td>
                    <td className="text-right py-2 px-4">{area.gvi_summer?.toFixed(1) ?? '-'}</td>
                    <td className="text-right py-2 px-4">{area.gvi_autumn?.toFixed(1) ?? '-'}</td>
                    <td className="py-2 px-4">
                      {ROAD_TYPE_LABELS[area.road_type || ''] || area.road_type || '-'}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${p.bg} ${p.color}`}>
                        {p.label}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-xs max-w-xs truncate" title={area.suggestion}>
                      {area.suggestion}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
