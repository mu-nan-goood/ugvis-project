import { useState, useEffect } from 'react'
import type { RouteCoord, RouteAnalysis } from '../types'
import { analyzeRoute, compareRoutes } from '../utils/api'

interface Waypoint extends RouteCoord {
  id: number
}

interface Props {
  /** 当前路线上的路点 */
  waypoints: Waypoint[]
  /** 添加路点（已废弃，暂不使用） */
  onAddWaypoint?: (lat: number, lng: number) => void
  /** 移除路点 */
  onRemoveWaypoint: (id: number) => void
  /** 清除所有 */
  onClear: () => void
  /** 路点变化时触发外部绘制 */
  onRouteChange: (coords: RouteCoord[]) => void
  /** 分析完成时，返回更绿路线坐标（用于在地图上绘制） */
  onGreenRouteFound?: (coords: RouteCoord[]) => void
}

export default function RouteAnalysisPanel({
  waypoints,
  onRemoveWaypoint,
  onClear,
  onRouteChange,
  onGreenRouteFound,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RouteAnalysis | null>(null)
  const [greenResult, setGreenResult] = useState<{
    analysis: RouteAnalysis
    verdict: string
    improvement: number
    lengthDiff: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Notify parent when waypoints change
  useEffect(() => {
    onRouteChange(waypoints.map((w) => ({ lat: w.lat, lng: w.lng })))
  }, [waypoints, onRouteChange])

  const handleAnalyze = async () => {
    if (waypoints.length < 2) return
    setLoading(true)
    setError(null)
    setResult(null)
    setGreenResult(null)
    try {
      const coords = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }))

      // Both calls in parallel
      const [analysis, comparison] = await Promise.all([
        analyzeRoute(coords),
        compareRoutes(coords),
      ])

      setResult(analysis)
      const greenCoords = comparison.green_route.coords
      setGreenResult({
        analysis: comparison.green_route,
        verdict: comparison.comparison.verdict,
        improvement: comparison.comparison.gvi_improvement_pct,
        lengthDiff: comparison.comparison.length_diff_m,
      })
      onGreenRouteFound?.(greenCoords)
    } catch (err: any) {
      setError(err?.message || '分析失败')
    } finally {
      setLoading(false)
    }
  }

  const formatDist = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`

  return (
    <div className="card space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          🌿 绿波路线规划
        </h3>
        <div className="flex gap-2">
          {waypoints.length >= 2 && (
            <>
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="btn-primary px-4 py-1.5 text-sm rounded-lg disabled:opacity-50"
              >
                {loading ? '分析中...' : '分析路线'}
              </button>
              <button
                onClick={onClear}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200"
              >
                清除
              </button>
            </>
          )}
        </div>
      </div>

      {/* 操作提示 */}
      {waypoints.length === 0 && (
        <p className="text-sm text-gray-400">
          点击地图添加路点（至少 2 个点）
        </p>
      )}

      {/* 路点列表 */}
      {waypoints.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {waypoints.map((wp, idx) => (
            <div
              key={wp.id}
              className="flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs"
            >
              <span className="font-bold">{idx + 1}</span>
              <span>
                {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
              </span>
              <button
                onClick={() => onRemoveWaypoint(wp.id)}
                className="ml-1 text-red-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="border-t pt-4 space-y-3">
          {/* 路线统计 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">路线长度</div>
              <div className="text-lg font-bold text-gray-800">
                {formatDist(result.total_length_m)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">采样点</div>
              <div className="text-lg font-bold text-gray-800">
                {result.total_samples}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">春季 GVI</div>
              <div className="text-lg font-bold text-green-600">
                {result.overall_gvi.spring ?? 'N/A'}%
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">冬季 GVI</div>
              <div className="text-lg font-bold text-red-500">
                {result.overall_gvi.winter ?? 'N/A'}%
              </div>
            </div>
          </div>

          {/* 四季对比 */}
          <div>
            <div className="text-xs text-gray-500 mb-1">四季 GVI 对比</div>
            <div className="flex gap-1 h-6">
              {(['spring', 'summer', 'autumn', 'winter'] as const).map((s) => {
                const val = result.overall_gvi[s]
                const pct = val != null ? Math.min(val, 50) : 0
                return (
                  <div key={s} className="flex-1 flex flex-col items-center">
                    <div className="w-full bg-gray-100 rounded-t overflow-hidden" style={{ height: '100%' }}>
                      <div
                        className={`h-full rounded-t transition-all ${
                          s === 'spring' ? 'bg-green-400' :
                          s === 'summer' ? 'bg-emerald-500' :
                          s === 'autumn' ? 'bg-yellow-500' :
                          'bg-blue-300'
                        }`}
                        style={{ height: `${pct * 2}%` }}
                      />
                    </div>
                    <span className="text-[10px] mt-0.5 text-gray-500">
                      {['春','夏','秋','冬'][['spring','summer','autumn','winter'].indexOf(s)]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 季节评价 */}
          {result.season_verdict.best_season && (
            <div className="text-sm text-center bg-gray-50 rounded-lg py-2">
              🌱 最佳季节: <strong>{result.season_verdict.best_season}</strong>
              {' · '}最差季节: <strong>{result.season_verdict.worst_season}</strong>
              {result.season_verdict.gap != null && (
                <> · 季节差距: <strong>{result.season_verdict.gap}%</strong></>
              )}
            </div>
          )}

          {/* 与绿化路线对比 */}
          {greenResult && (
            <div className="border-t pt-3">
              <div className="text-sm font-medium mb-2">🆚 对比更绿路线</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">当前路线</div>
                  <div className="font-bold text-gray-800">
                    {formatDist(result.total_length_m)}
                  </div>
                  <div className="text-xs text-gray-700">
                    GVI {result.overall_gvi.spring ?? '?'}%
                  </div>
                </div>
                <div className={`rounded-lg p-2 text-center ${
                  greenResult.improvement > 10
                    ? 'bg-green-50'
                    : 'bg-gray-50'
                }`}>
                  <div className="text-xs text-gray-500">绿化路线</div>
                  <div className="font-bold text-green-700">
                    {formatDist(greenResult.analysis.total_length_m)}
                  </div>
                  <div className="text-xs text-green-600">
                    GVI {greenResult.analysis.overall_gvi.spring ?? '?'}%
                    {greenResult.improvement > 0 && (
                      <span className="ml-1">(+{greenResult.improvement}%)</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-center text-gray-600 bg-gray-50 rounded-lg py-1.5 px-2">
                {greenResult.verdict}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-500 bg-red-50 rounded-lg p-2">
          ❌ {error}
        </div>
      )}
    </div>
  )
}
