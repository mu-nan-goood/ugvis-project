import { useState, useEffect, useCallback } from 'react'
import GVIMap from '../components/GVIMap'
import type { MapPoint, Season } from '../types'
import { SEASON_LABELS } from '../types'
import { fetchMapPoints } from '../utils/api'

export default function MapView() {
  const [season, setSeason] = useState<Season>('spring')
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMapPoints({ season, limit: 8000 })
      setPoints(data.points || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [season])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">GVI空间分布</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {loading ? '加载中...' : `${points.length.toLocaleString()} 个采样点`}
          </span>
          <div className="flex gap-2">
            {(Object.keys(SEASON_LABELS) as Season[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  season === s
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {SEASON_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden" style={{ height: '600px' }}>
        {error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500">加载失败: {error}</p>
          </div>
        ) : (
          <GVIMap points={points} season={season} className="h-full" />
        )}
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-2">图例</h3>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-600" />
            <span>GVI &gt; 30% (高绿化)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-500" />
            <span>GVI 15-30% (中等绿化)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span>GVI &lt; 15% (低绿化)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
