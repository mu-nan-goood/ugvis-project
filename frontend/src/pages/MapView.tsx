import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import GVIMap, { type DisplayMode, type BaseMap } from '../components/GVIMap'
import RouteAnalysisPanel from '../components/RouteAnalysisPanel'
import type { MapPoint, Season, RouteCoord } from '../types'
import { SEASON_LABELS } from '../types'
import { fetchMapPoints } from '../utils/api'

interface Waypoint extends RouteCoord {
  id: number
}

const GVI_FILTER_MAP: Record<string, { min_gvi?: number; max_gvi?: number }> = {
  all: {},
  low: { max_gvi: 15 },
  medium: { min_gvi: 15, max_gvi: 30 },
  high: { min_gvi: 30 },
}
const ROAD_LABELS: Record<string, string> = { rc1: '快速路', rc2: '主干路', rc3: '次干路', rc4: '支路' }

export default function MapView() {
  const [searchParams] = useSearchParams()
  const [season, setSeason] = useState<Season>('spring')
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── GVI 过滤 ──────────────────────────────────────
  const [gviFilter, setGviFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [roadFilter, setRoadFilter] = useState<string>('all')

  // ── 显示模式: 散点 / 热力图 ──────────────────────────
  const [displayMode, setDisplayMode] = useState<DisplayMode>('points')

  // ── 底图切换 ────────────────────────────────────────
  const [baseMap, setBaseMap] = useState<BaseMap>('gaode')

  // ── 路线规划模式 ─────────────────────────────────────
  const [planningMode, setPlanningMode] = useState(false)
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [, setRouteCoords] = useState<RouteCoord[]>([])
  const [highlightCoords, setHighlightCoords] = useState<RouteCoord[]>([])

  // ── URL 参数解析 ─────────────────────────────────────
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

  const initCenter = rawLat && rawLng ? { lat: Number(rawLat), lng: Number(rawLng) } : undefined

  // ── 数据加载 ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Heatmap mode can handle more points (no DOM markers),
      // point mode is limited by CircleMarker rendering performance
      const limit = displayMode === 'heatmap' ? 20000 : 8000
      const filters: Record<string, string | number | undefined> = { season, limit }
      const gviRange = GVI_FILTER_MAP[gviFilter]
      if (gviRange.min_gvi !== undefined) filters.min_gvi = gviRange.min_gvi
      if (gviRange.max_gvi !== undefined) filters.max_gvi = gviRange.max_gvi
      if (roadFilter !== 'all') filters.road_type = roadFilter
      const data = await fetchMapPoints(filters)
      setPoints(data.points || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [season, gviFilter, roadFilter, displayMode])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── AI 交互回调 ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      window.parent.postMessage({ type: 'ask-ai', pointId: e.detail?.pointId }, '*')
    }
    window.addEventListener('ugvis-ask-ai', handler as EventListener)
    return () => window.removeEventListener('ugvis-ask-ai', handler as EventListener)
  }, [])

  // ── 地图点击（路线模式）───────────────────────────────
  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!planningMode) return
      setWaypoints((prev) => [...prev, { lat, lng, id: Date.now() }])
    },
    [planningMode]
  )

  const handleRemoveWaypoint = useCallback((id: number) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id))
  }, [])

  const handleClearWaypoints = useCallback(() => {
    setWaypoints([])
    setRouteCoords([])
    setHighlightCoords([])
  }, [])

  const handleRouteChange = useCallback((coords: RouteCoord[]) => {
    setRouteCoords(coords)
  }, [])

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">GVI空间分布</h2>

        <div className="flex items-center gap-3 flex-wrap">
          {/* GVI 过滤 */}
          <div className='flex items-center gap-1.5'>
            <span className='text-xs text-gray-500'>GVI:</span>
            {(['all', 'low', 'medium', 'high'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setGviFilter(f)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  gviFilter === f
                    ? f === 'low' ? 'bg-red-100 text-red-700' : f === 'medium' ? 'bg-yellow-100 text-yellow-700' : f === 'high' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {{ all: '全部', low: '<15%', medium: '15-30%', high: '>30%' }[f]}
              </button>
            ))}
          </div>

          {/* 显示模式切换 */}
          <div className='flex items-center gap-1.5'>
            <span className='text-xs text-gray-500'>视图:</span>
            <button
              onClick={() => setDisplayMode('points')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                displayMode === 'points'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              🔵 散点
            </button>
            <button
              onClick={() => setDisplayMode('heatmap')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                displayMode === 'heatmap'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              🌡️ 热力图
            </button>
          </div>

          {/* 底图切换 */}
          <div className='flex items-center gap-1.5'>
            <span className='text-xs text-gray-500'>底图:</span>
            {([
              { key: 'gaode', label: '📍 高德' },
              { key: 'gaode-satellite', label: '🛰 卫星' },
              { key: 'osm', label: '🗺 OSM' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setBaseMap(key)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  baseMap === key
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 道路类型过滤 */}
          <div className='flex items-center gap-1.5'>
            <span className='text-xs text-gray-500'>道路:</span>
            <select
              value={roadFilter}
              onChange={(e) => setRoadFilter(e.target.value)}
              className='border rounded px-2 py-1 text-xs'
            >
              <option value='all'>全部</option>
              {Object.entries(ROAD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* 模式切换 */}
          <button
            onClick={() => {
              setPlanningMode(!planningMode)
              if (!planningMode) {
                handleClearWaypoints()
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              planningMode
                ? 'bg-green-600 text-white shadow-lg shadow-green-200'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {planningMode ? '🌿 路线模式' : '🗺 浏览模式'}
          </button>

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

      {/* 地图 + 面板 */}
      <div className={`grid ${planningMode ? 'grid-cols-1 xl:grid-cols-3' : ''} gap-4`}>
        {/* 地图 */}
        <div className={`card p-0 overflow-hidden ${planningMode ? 'xl:col-span-2' : ''}`} style={{ height: '600px' }}>
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
              displayMode={displayMode}
              baseMap={baseMap}
              planningMode={planningMode}
              routeWaypoints={waypoints.map((w) => ({ lat: w.lat, lng: w.lng }))}
              extraRouteCoords={highlightCoords}
              extraRouteColor="#16a34a"
              onMapClick={handleMapClick}
              onHighlightClick={(id) => {
                window.dispatchEvent(
                  new CustomEvent('ugvis-ask-ai', { detail: { pointId: id } }),
                )
              }}
            />
          )}
        </div>

        {/* 路线分析面板（路线模式下显示） */}
        {planningMode && (
          <div>
            <RouteAnalysisPanel
              waypoints={waypoints}
              onAddWaypoint={(lat, lng) => handleMapClick(lat, lng)}
              onRemoveWaypoint={handleRemoveWaypoint}
              onClear={handleClearWaypoints}
              onRouteChange={handleRouteChange}
              onGreenRouteFound={(coords) => setHighlightCoords(coords)}
            />
          </div>
        )}
      </div>

      {/* 图例 */}
      {!planningMode && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-2">
            {displayMode === 'heatmap' ? '热力图图例' : '图例'}
          </h3>
          <div className="flex flex-wrap gap-6 text-sm">
            {displayMode === 'heatmap' ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex h-3 w-20 rounded-sm overflow-hidden">
                    <div className='flex-1' style={{ background: '#1a1a2e' }} />
                    <div className='flex-1' style={{ background: '#dc2626' }} />
                    <div className='flex-1' style={{ background: '#f97316' }} />
                    <div className='flex-1' style={{ background: '#eab308' }} />
                    <div className='flex-1' style={{ background: '#22c55e' }} />
                    <div className='flex-1' style={{ background: '#16a34a' }} />
                  </div>
                  <span>0% → 50%+ GVI</span>
                </div>
                <p className='text-xs text-gray-500'>热力图颜色越绿，表示该区域绿视率越高</p>
              </>
            ) : (
              <>
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
              </>
            )}
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
                <div className="w-6 h-0.5" style={{ background: '#8b5cf6', borderStyle: 'dashed', borderWidth: '1px 0 0 0', borderColor: '#8b5cf6' }} />
                <span>推荐路线</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
