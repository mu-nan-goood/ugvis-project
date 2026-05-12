import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import GVIMap from '../components/GVIMap'
import type { MapPoint, Season } from '../types'
import { SEASON_LABELS } from '../types'
import { fetchMapPoints } from '../utils/api'

export default function MapView() {
  const [searchParams] = useSearchParams()
  const [season, setSeason] = useState<Season>('spring')
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── URL 参数解析 ─────────────────────────────────────
  // highlight: 逗号分隔的 point ids（高亮显示）
  // lat,lng:   地图中心坐标
  // route:      逗号分隔的 point ids（按顺序绘制路线）
  const rawHighlight = searchParams.get('highlight') ?? ''
  const rawRoute = searchParams.get('route') ?? ''
  const rawLat = searchParams.get('lat')
  const rawLng = searchParams.get('lng')

  const highlightIds: number[] = rawHighlight
    ? rawHighlight.split(',').flatMap((s) => {
        const n = Number(s.trim())
        return isNaN(n) ? [] : [n]
      })
    : []

  const highlightRoute: number[] = rawRoute
    ? rawRoute.split(',').flatMap((s) => {
        const n = Number(s.trim())
        return isNaN(n) ? [] : [n]
      })
    : []

  // 从 weak area 传入的中心坐标（无高亮点时使用）
  const initCenter = rawLat && rawLng ? { lat: Number(rawLat), lng: Number(rawLng) } : undefined

  // ── 数据加载 ─────────────────────────────────────────
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

  // ── AI 交互回调（挂到 window 上供地图 popup 调用）───
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      // 转发到父窗口（Planning 页面）
      window.parent.postMessage({ type: 'ask-ai', pointId: e.detail?.pointId }, '*')
    }
    window.addEventListener('ugvis-ask-ai', handler as EventListener)
    return () => window.removeEventListener('ugvis-ask-ai', handler as EventListener)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">GVI空间分布</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {loading
              ? '加载中...'
              : `${points.length.toLocaleString()} 个采样点${
                  highlightIds.length > 0 ? ` · ${highlightIds.length} 个高亮点` : ''
                }${highlightRoute.length > 1 ? ` · 路线含 ${highlightRoute.length} 点` : ''}`}
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
          <GVIMap
            points={points}
            season={season}
            className="h-full"
            highlightIds={highlightIds}
            highlightRoute={highlightRoute}
            initialCenter={initCenter}
            onHighlightClick={(id) => {
              // 触发 AI 询问事件
              window.dispatchEvent(
                new CustomEvent('ugvis-ask-ai', { detail: { pointId: id } }),
              )
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-2">图例</h3>
        <div className="flex flex-wrap gap-6 text-sm">
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
          {highlightIds.length > 0 && (
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }}
              />
              <span>薄弱区域（高亮）</span>
            </div>
          )}
          {highlightRoute.length > 1 && (
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-0.5"
                style={{
                  background: '#8b5cf6',
                  borderStyle: 'dashed',
                  borderWidth: '1px 0 0 0',
                  borderColor: '#8b5cf6',
                }}
              />
              <span>推荐路线</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
