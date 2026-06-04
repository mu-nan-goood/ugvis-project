import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import GVIMap, { type DisplayMode, type BaseMap } from '../components/GVIMap'
const GVI3DMap = lazy(() => import('../components/GVI3DMap'))
import RouteAnalysisPanel from '../components/RouteAnalysisPanel'
import StreetViewPanel from '../components/StreetViewPanel'
import { SkeletonMap } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
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

const GVI_FILTER_STYLES: Record<string, string> = {
  all: 'bg-surface-200 dark:bg-surface-700 text-surface-700 dark:text-surface-200',
  low: 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300',
  medium: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-300',
  high: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300',
}
const GVI_FILTER_LABELS: Record<string, string> = { all: '全部', low: '<15%', medium: '15-30%', high: '>30%' }

export default function MapView() {
  const waypointIdRef = useRef(0)
  const [searchParams] = useSearchParams()
  const [season, setSeason] = useState<Season>('spring')
  const [points, setPoints] = useState<MapPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [gviFilter, setGviFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [roadFilter, setRoadFilter] = useState<string>('all')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('points')
  const [baseMap, setBaseMap] = useState<BaseMap>('gaode')
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')

  const [planningMode, setPlanningMode] = useState(false)
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [_routeCoords, setRouteCoords] = useState<RouteCoord[]>([])
  const [highlightCoords, setHighlightCoords] = useState<RouteCoord[]>([])
  const [routePath, setRoutePath] = useState<RouteCoord[]>([])
  const [streetViewPoint, setStreetViewPoint] = useState<MapPoint | null>(null)

  const rawHighlight = searchParams.get('highlight') ?? ''
  const rawRoute = searchParams.get('route') ?? ''
  const rawLat = searchParams.get('lat')
  const rawLng = searchParams.get('lng')

  const highlightIds: number[] = rawHighlight
    ? rawHighlight.split(',').flatMap((s) => { const n = Number(s.trim()); return isNaN(n) ? [] : [n] })
    : []

  const highlightRoute: number[] = rawRoute
    ? rawRoute.split(',').flatMap((s) => { const n = Number(s.trim()); return isNaN(n) ? [] : [n] })
    : []

  const initCenter = (rawLat && rawLng && !isNaN(Number(rawLat)) && !isNaN(Number(rawLng)))
    ? { lat: Number(rawLat), lng: Number(rawLng) }
    : undefined

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
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

  useEffect(() => { loadData() }, [loadData])

  const routeWaypoints = useMemo(() => waypoints.map((w) => ({ lat: w.lat, lng: w.lng })), [waypoints])

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      window.parent.postMessage({ type: 'ask-ai', pointId: e.detail?.pointId }, window.location.origin)
    }
    window.addEventListener('ugvis-ask-ai', handler as EventListener)
    return () => window.removeEventListener('ugvis-ask-ai', handler as EventListener)
  }, [])

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!planningMode) return
      setWaypoints((prev) => [...prev, { lat, lng, id: ++waypointIdRef.current }])
    },
    [planningMode],
  )

  const handleRemoveWaypoint = useCallback((id: number) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id))
  }, [])

  const handleUndoWaypoint = useCallback(() => {
    setWaypoints((prev) => prev.length > 0 ? prev.slice(0, -1) : prev)
  }, [])

  const handleClearWaypoints = useCallback(() => {
    setWaypoints([])
    setRouteCoords([])
    setHighlightCoords([])
    setRoutePath([])
  }, [])

  const handleRouteChange = useCallback((coords: RouteCoord[]) => {
    setRouteCoords(coords)
  }, [])

  // ── Segmented button helper ──────────────────────────
  const segBtn = (active: boolean, activeClass: string) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 press-scale ${
      active ? activeClass : 'text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
    }`

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">
              GVI空间分布
            </h2>
            <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
              交互式绿视率地图浏览与路线规划
            </p>
          </div>
          <span className="text-xs text-surface-400 dark:text-surface-500 tabular-nums">
            {loading ? '⏳ 加载中…' : `${points.length.toLocaleString()} 个采样点${
              highlightIds.length > 0 ? ` · ${highlightIds.length} 高亮` : ''
            }${highlightRoute.length > 1 ? ` · 路线${highlightRoute.length}点` : ''}`}
          </span>
        </div>

        {/* ── Toolbar ──────────────────────────────── */}
        <motion.div
          layout
          className="card !p-2 flex items-center gap-1.5 flex-wrap"
        >
          {/* Season */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-surface-200 dark:border-surface-700">
            {(Object.keys(SEASON_LABELS) as Season[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  season === s
                    ? 'bg-primary-600 text-white shadow-soft'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                }`}
              >
                {SEASON_LABELS[s]}
              </button>
            ))}
          </div>

          {/* GVI filter */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-surface-200 dark:border-surface-700">
            {(['all', 'low', 'medium', 'high'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setGviFilter(f)}
                className={segBtn(gviFilter === f, GVI_FILTER_STYLES[f])}
              >
                {GVI_FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {/* Display mode */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-surface-200 dark:border-surface-700">
            <button
              onClick={() => setDisplayMode('points')}
              className={segBtn(displayMode === 'points', 'bg-info-100 text-info-700 dark:bg-info-900/30 dark:text-info-300')}
            >
              {viewMode === '3d' ? '3D散点' : '散点'}
            </button>
            <button
              onClick={() => setDisplayMode('heatmap')}
              className={segBtn(displayMode === 'heatmap', 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300')}
            >
              {viewMode === '3d' ? '热力柱' : '热力图'}
            </button>
          </div>

          {/* Base map */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-surface-200 dark:border-surface-700">
            {([
              { key: 'gaode' as const, label: '高德' },
              { key: 'gaode-satellite' as const, label: '卫星' },
              { key: 'osm' as const, label: 'OSM' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setBaseMap(key)}
                className={segBtn(baseMap === key, 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 2D / 3D */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-surface-200 dark:border-surface-700">
            <button
              onClick={() => setViewMode('2d')}
              className={segBtn(viewMode === '2d', 'bg-info-100 text-info-700 dark:bg-info-900/30 dark:text-info-300')}
            >
              2D
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={segBtn(viewMode === '3d', 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300')}
            >
              3D
            </button>
          </div>

          {/* Road type */}
          <select
            value={roadFilter}
            onChange={(e) => setRoadFilter(e.target.value)}
            className="input !py-1 !px-2 !text-xs !w-auto"
          >
            <option value="all">全部道路</option>
            {Object.entries(ROAD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {/* Planning mode */}
          <button
            onClick={() => {
              if (planningMode && waypoints.length > 0 && !window.confirm('退出路线模式将清除所有路点，确认退出？')) return
              if (planningMode) handleClearWaypoints()
              setPlanningMode(!planningMode)
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ml-1 ${
              planningMode
                ? 'bg-primary-600 text-white shadow-lift'
                : 'btn-secondary !py-1.5 !text-xs'
            }`}
          >
            {planningMode ? '🌿 路线模式' : '🗺️ 浏览模式'}
          </button>
        </motion.div>
      </div>

      {/* ── Map + Route Panel ──────────────────────── */}
      <div className={`grid ${planningMode ? 'grid-cols-1 xl:grid-cols-3' : ''} gap-4`}>
        <motion.div
          layout
          className={`card !p-0 overflow-hidden ${planningMode ? 'xl:col-span-2' : ''}`}
          style={{ height: '600px' }}
        >
          {error ? (
            <EmptyState
              icon={<span className="text-5xl">⚠️</span>}
              title="地图加载失败"
              description={error}
              action={{ label: '重新加载', onClick: loadData }}
            />
          ) : loading ? (
            <SkeletonMap />
          ) : viewMode === '2d' ? (
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
              onStreetView={(point) => setStreetViewPoint(point)}
              routeWaypoints={routeWaypoints}
              routePath={routePath}
              extraRouteCoords={highlightCoords}
              extraRouteColor="#16a34a"
              onMapClick={handleMapClick}
              preferCanvas={false}
              onHighlightClick={(id) => {
                window.dispatchEvent(new CustomEvent('ugvis-ask-ai', { detail: { pointId: id } }))
              }}
            />
          ) : (
            <Suspense fallback={<SkeletonMap />}>
              <GVI3DMap
                points={points}
                season={season}
                className="h-full"
                highlightIds={highlightIds}
                initialCenter={initCenter}
                displayMode={displayMode}
                onPointClick={(point) => setStreetViewPoint(point)}
                routePath={routePath}
                greenRoutePath={highlightCoords}
              />
            </Suspense>
          )}
        </motion.div>

        <AnimatePresence>
          {planningMode && (
            <motion.div
              key="route-panel"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <RouteAnalysisPanel
                waypoints={waypoints}
                season={season}
                onAddWaypoint={(lat, lng) => handleMapClick(lat, lng)}
                onRemoveWaypoint={handleRemoveWaypoint}
                onUndoWaypoint={handleUndoWaypoint}
                onClear={handleClearWaypoints}
                onRouteChange={handleRouteChange}
                onGreenRouteFound={(coords) => setHighlightCoords(coords)}
                onRoutePlanned={(pathCoords) => setRoutePath(pathCoords)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Legend ─────────────────────────────────── */}
      <AnimatePresence>
        {!planningMode && (
          <motion.div
            key="legend"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="card !p-3"
          >
            <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wide mb-2">
              {displayMode === 'heatmap' ? '热力图图例' : '图例'}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-xs text-surface-600 dark:text-surface-300">
              {displayMode === 'heatmap' ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex h-2.5 w-20 rounded-full overflow-hidden">
                      <div className="flex-1" style={{ background: '#1a1a2e' }} />
                      <div className="flex-1" style={{ background: '#dc2626' }} />
                      <div className="flex-1" style={{ background: '#f97316' }} />
                      <div className="flex-1" style={{ background: '#eab308' }} />
                      <div className="flex-1" style={{ background: '#22c55e' }} />
                      <div className="flex-1" style={{ background: '#16a34a' }} />
                    </div>
                    <span>0% → 50%+ GVI</span>
                  </div>
                  <span className="text-surface-300 dark:text-surface-600">|</span>
                  <span className="text-surface-400">颜色越绿，绿视率越高</span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-success-600" />
                    <span>GVI &gt; 30%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-warning-500" />
                    <span>GVI 15-30%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-danger-500" />
                    <span>GVI &lt; 15%</span>
                  </div>
                </>
              )}
              {highlightIds.length > 0 && (
                <>
                  <span className="text-surface-300 dark:text-surface-600">|</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-info-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
                    <span>薄弱区域</span>
                  </div>
                </>
              )}
              {highlightRoute.length > 1 && (
                <>
                  <span className="text-surface-300 dark:text-surface-600">|</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 border-t-2 border-dashed border-accent-500" />
                    <span>推荐路线</span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Street View ────────────────────────────── */}
      <StreetViewPanel
        point={streetViewPoint}
        onClose={() => setStreetViewPoint(null)}
      />
    </div>
  )
}
