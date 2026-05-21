import { useState, useEffect, useRef } from 'react'
import type { RouteCoord, RouteAnalysis, SegmentGVI, Season } from '../types'
import { SEASON_LABELS } from '../types'
import { analyzeRoute, compareRoutes } from '../utils/api'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
])

/** GVI 沿路线剖面图 */
function RouteProfileChart({ segments, overallGvi }: {
  segments: SegmentGVI[]
  overallGvi: RouteAnalysis['overall_gvi']
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return
    instanceRef.current = echarts.init(chartRef.current)
    const handleResize = () => instanceRef.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!instanceRef.current || segments.length === 0) return

    // X轴：累积距离(km)
    let cumulativeDist = 0
    const xData: number[] = [0]
    segments.forEach((seg) => {
      cumulativeDist += seg.length_m
      xData.push(Math.round(cumulativeDist) / 1000)
    })

    const seasons = [
      { key: 'spring' as const, label: '春季', color: '#4ade80' },
      { key: 'summer' as const, label: '夏季', color: '#10b981' },
      { key: 'autumn' as const, label: '秋季', color: '#f59e0b' },
      { key: 'winter' as const, label: '冬季', color: '#60a5fa' },
    ]

    const series = seasons.map(({ key, label, color }) => {
      // 每个segment的GVI作为该段终点的值，起点用段首值
      const data: (number | null)[] = []
      segments.forEach((seg) => {
        const val = seg.avg_gvi[key]
        // 每段一个数据点
        if (data.length === 0) data.push(val)
        data.push(val)
      })
      return {
        name: label,
        type: 'line' as const,
        data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 2, color },
        itemStyle: { color },
        markLine:
          key === 'spring'
            ? {
                silent: true,
                symbol: 'none' as const,
                lineStyle: { type: 'dashed' as const, color: '#ef4444', width: 1 },
                data: [
                  {
                    yAxis: overallGvi.spring,
                    label: {
                      formatter: `均值 ${overallGvi.spring}%`,
                      position: 'insideEndTop' as const,
                      fontSize: 10,
                      color: '#ef4444',
                    },
                  },
                ],
              }
            : undefined,
      }
    })

    instanceRef.current.setOption(
      {
        title: {
          text: '路线 GVI 剖面',
          left: 'center',
          textStyle: { fontSize: 13, fontWeight: 600 },
        },
        tooltip: {
          trigger: 'axis',
          formatter(params: unknown) {
            const ps = params as { seriesName: string; value: number | null; axisValueLabel: string }[]
            let tip = `<b>${ps[0]?.axisValueLabel ?? ''} km</b><br/>`
            ps.forEach((p) => {
              if (p.value != null) {
                tip += `${p.seriesName}: <b>${p.value}%</b><br/>`
              }
            })
            return tip
          },
        },
        legend: {
          bottom: 0,
          textStyle: { fontSize: 10 },
        },
        grid: { top: 35, right: 15, bottom: 30, left: 45 },
        xAxis: {
          type: 'category',
          data: xData.map((d) => d.toFixed(2)),
          name: '距离 (km)',
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10 },
        },
        yAxis: {
          type: 'value',
          name: 'GVI (%)',
          nameTextStyle: { fontSize: 10 },
          axisLabel: { fontSize: 10, formatter: '{value}%' },
          min: (value: { min: number }) => Math.max(0, Math.floor(value.min) - 2),
        },
        series,
      },
      { notMerge: true },
    )
  }, [segments, overallGvi])

  return <div ref={chartRef} className="w-full" style={{ height: 220 }} />
}

interface Waypoint extends RouteCoord {
  id: number
}

interface Props {
  /** 当前路线上的路点 */
  waypoints: Waypoint[]
  /** 当前选择的季节 */
  season?: string
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
  season,
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
        analyzeRoute(coords, season),
        compareRoutes(coords, season),
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '分析失败')
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
              🌱 最佳季节: <strong>{SEASON_LABELS[result.season_verdict.best_season as Season] ?? result.season_verdict.best_season}</strong>
              {' · '}最差季节: <strong>{SEASON_LABELS[result.season_verdict.worst_season as Season] ?? result.season_verdict.worst_season}</strong>
              {result.season_verdict.gap != null && (
                <> · 季节差距: <strong>{result.season_verdict.gap}%</strong></>
              )}
            </div>
          )}

          {/* GVI 剖面图 */}
          {result.segments.length > 0 && (
            <RouteProfileChart segments={result.segments} overallGvi={result.overall_gvi} />
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
