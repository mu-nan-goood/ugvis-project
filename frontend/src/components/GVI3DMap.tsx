import { useEffect, useRef, useState, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/CesiumUnminified/Widgets/widgets.css'
import type { MapPoint, Season, RouteCoord } from '../types'
import { fetchRoads3D, type RoadGeoJSON } from '../utils/api'

export type DisplayMode3D = 'points' | 'heatmap'

interface GVI3DMapProps {
  points: MapPoint[]
  season: Season
  className?: string
  highlightIds?: number[]
  initialCenter?: { lat: number; lng: number }
  onPointClick?: (point: MapPoint) => void
  displayMode?: DisplayMode3D
  /** 路线规划坐标，3D中高亮显示 */
  routePath?: RouteCoord[]
  /** 绿化路线推荐坐标 */
  greenRoutePath?: RouteCoord[]
}

// 南京市中心
const NANJING_CENTER = Cesium.Cartesian3.fromDegrees(118.78, 32.05, 5000)

/** GVI → Cesium.Color 映射 (红→黄→绿，与2D一致) */
function gviToColor(gvi: number | null): Cesium.Color {
  if (gvi == null) return Cesium.Color.GRAY.withAlpha(0.5)
  const t = Math.min(gvi / 40, 1)
  if (t < 0.375) {
    return Cesium.Color.lerp(
      Cesium.Color.fromCssColorString('#ef4444'),
      Cesium.Color.fromCssColorString('#eab308'),
      t / 0.375,
      new Cesium.Color(),
    )
  }
  return Cesium.Color.lerp(
    Cesium.Color.fromCssColorString('#eab308'),
    Cesium.Color.fromCssColorString('#22c55e'),
    (t - 0.375) / 0.625,
    new Cesium.Color(),
  )
}

/** 热力柱体颜色（低GVI红色高柱，高GVI绿色矮柱） */
function heatmapColor(gvi: number): Cesium.Color {
  const t = Math.min(gvi / 30, 1)
  if (t < 0.4) {
    return Cesium.Color.lerp(
      Cesium.Color.fromCssColorString('#dc2626'),
      Cesium.Color.fromCssColorString('#f97316'),
      t / 0.4,
      new Cesium.Color(),
    )
  } else if (t < 0.7) {
    return Cesium.Color.lerp(
      Cesium.Color.fromCssColorString('#f97316'),
      Cesium.Color.fromCssColorString('#eab308'),
      (t - 0.4) / 0.3,
      new Cesium.Color(),
    )
  }
  return Cesium.Color.lerp(
    Cesium.Color.fromCssColorString('#eab308'),
    Cesium.Color.fromCssColorString('#22c55e'),
    (t - 0.7) / 0.3,
    new Cesium.Color(),
  )
}

/** 道路类型 → 3D线条颜色 */
const ROAD_TYPE_COLORS: Record<string, Cesium.Color> = {
  rc1: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.9),  // 琥珀 — 快速路
  rc2: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.85), // 蓝 — 主干道
  rc3: Cesium.Color.fromCssColorString('#8b5cf6').withAlpha(0.8),  // 紫 — 次干道
  rc4: Cesium.Color.fromCssColorString('#6b7280').withAlpha(0.6),  // 灰 — 支路
}

/** GVI → 道路颜色（绿色渐变） */
function roadGviColor(avgGvi: number | null, roadType: string): Cesium.Color {
  if (avgGvi == null) return ROAD_TYPE_COLORS[roadType] || ROAD_TYPE_COLORS.rc4
  const t = Math.min(avgGvi / 35, 1)
  // 从红到绿的渐变，带一定透明度
  return Cesium.Color.lerp(
    Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.7),
    Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.9),
    t,
    new Cesium.Color(),
  )
}

interface HoveredPoint {
  point: MapPoint
  x: number
  y: number
}

export default function GVI3DMap({
  points,
  className = '',
  highlightIds = [],
  initialCenter,
  onPointClick,
  displayMode = 'points',
  routePath = [],
  greenRoutePath = [],
}: GVI3DMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const pointCollectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null)
  const cylinderCollectionRef = useRef<Cesium.PrimitiveCollection | null>(null)
  const roadCollectionRef = useRef<Cesium.PrimitiveCollection | null>(null)
  const routeCollectionRef = useRef<Cesium.PrimitiveCollection | null>(null)
  const pointByIdRef = useRef<Map<number, MapPoint>>(new Map())
  const [hovered, setHovered] = useState<HoveredPoint | null>(null)
  const [showRoads, setShowRoads] = useState(true)
  const [roadColorMode, setRoadColorMode] = useState<'type' | 'gvi'>('gvi')
  const [roadsLoading, setRoadsLoading] = useState(false)
  const [roadsCount, setRoadsCount] = useState(0)
  const [isFlying, setIsFlying] = useState(false)
  const roadsDataRef = useRef<RoadGeoJSON | null>(null)

  // Cesium ion Token
  const cesiumToken = import.meta.env.VITE_CESIUM_TOKEN as string | undefined

  // 性能：点数限制
  const displayPoints = displayMode === 'heatmap'
    ? points.slice(0, 15000)
    : points.slice(0, 20000)

  // 更新索引
  useEffect(() => {
    pointByIdRef.current = new Map(points.map((p) => [p.point_id, p]))
  }, [points])

  // ─── 加载道路数据 ─────────────────────────────────
  useEffect(() => {
    if (!showRoads) return
    let cancelled = false
    setRoadsLoading(true)
    fetchRoads3D({ limit: 10000 })
      .then((data) => {
        if (!cancelled) {
          roadsDataRef.current = data
          setRoadsCount(data.count)
          setRoadsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setRoadsLoading(false)
      })
    return () => { cancelled = true }
  }, [showRoads])

  // ─── 初始化 Cesium Viewer ──────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    if (cesiumToken) {
      Cesium.Ion.defaultAccessToken = cesiumToken
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: cesiumToken
        ? Cesium.ImageryLayer.fromProviderAsync(
            Cesium.IonImageryProvider.fromAssetId(2),
          )
        : new Cesium.ImageryLayer(
            new Cesium.OpenStreetMapImageryProvider({
              url: 'https://tile.openstreetmap.org/',
            }),
          ),
      terrain: cesiumToken
        ? Cesium.Terrain.fromWorldTerrain()
        : undefined,
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      sceneMode: Cesium.SceneMode.SCENE3D,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    })

    // OSM Buildings 3D Tiles
    if (cesiumToken) {
      Cesium.createOsmBuildingsAsync().then((tileset) => {
        viewer.scene.primitives.add(tileset)
      }).catch(() => {})
    }

    // 飞到南京
    viewer.camera.flyTo({
      destination: initialCenter
        ? Cesium.Cartesian3.fromDegrees(initialCenter.lng, initialCenter.lat, 5000)
        : NANJING_CENTER,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 2,
    })

    // 隐藏默认credit
    try {
      const creditEl = viewer.cesiumWidget.creditContainer as HTMLElement
      creditEl.style.display = 'none'
    } catch { /* 非关键 */ }

    // 启用深度检测（道路线条显示在地面之上）
    viewer.scene.globe.depthTestAgainstTerrain = !!cesiumToken

    viewerRef.current = viewer

    // 点集合
    const pointCollection = new Cesium.PointPrimitiveCollection()
    viewer.scene.primitives.add(pointCollection)
    pointCollectionRef.current = pointCollection

    // 柱体集合
    const cylinderCollection = new Cesium.PrimitiveCollection()
    viewer.scene.primitives.add(cylinderCollection)
    cylinderCollectionRef.current = cylinderCollection

    // 道路集合
    const roadCollection = new Cesium.PrimitiveCollection()
    viewer.scene.primitives.add(roadCollection)
    roadCollectionRef.current = roadCollection

    // 路线集合
    const routeCollection = new Cesium.PrimitiveCollection()
    viewer.scene.primitives.add(routeCollection)
    routeCollectionRef.current = routeCollection

    return () => {
      try { viewer.camera.cancelFlight() } catch { /* ignore */ }
      try { viewer.scene.primitives.removeAll() } catch { /* ignore */ }
      try { viewer.entities.removeAll() } catch { /* ignore */ }
      try { viewer.destroy() } catch { /* ignore */ }
      viewerRef.current = null
      pointCollectionRef.current = null
      cylinderCollectionRef.current = null
      roadCollectionRef.current = null
      routeCollectionRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter])

  // ─── 渲染采样点 / 热力柱体 ─────────────────────────
  useEffect(() => {
    const pointCollection = pointCollectionRef.current
    const cylinderCollection = cylinderCollectionRef.current
    if (!pointCollection || !cylinderCollection) return

    const viewer = viewerRef.current
    if (!viewer) return

    pointCollection.removeAll()
    cylinderCollection.removeAll()

    if (displayMode === 'heatmap') {
      const groups: Map<string, Array<{ point: MapPoint; height: number }>> = new Map()

      for (const point of displayPoints) {
        if (point.gvi == null) continue
        const maxHeight = 500
        const normalizedGvi = Math.min(point.gvi / 30, 1)
        const height = maxHeight * (1 - normalizedGvi)
        const colorKey = normalizedGvi < 0.2 ? '0' : normalizedGvi < 0.4 ? '1' : normalizedGvi < 0.5 ? '2' : normalizedGvi < 0.6 ? '3' : normalizedGvi < 0.8 ? '4' : '5'
        if (!groups.has(colorKey)) groups.set(colorKey, [])
        groups.get(colorKey)!.push({ point, height })
      }

      for (const [, group] of groups) {
        if (group.length === 0) continue
        const sample = group[0]
        const color = heatmapColor(sample.point.gvi!).withAlpha(0.7)

        const instances: Cesium.GeometryInstance[] = group.map(({ point, height }) =>
          new Cesium.GeometryInstance({
            geometry: new Cesium.CylinderGeometry({
              length: Math.max(height, 1),
              topRadius: 15,
              bottomRadius: 15,
            }),
            modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(
              Cesium.Cartesian3.fromDegrees(point.lng, point.lat, Math.max(height, 1) / 2),
            ),
            id: point.point_id,
          }),
        )

        const primitive = new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.MaterialAppearance({
            material: new Cesium.Material({
              fabric: { type: 'Color', uniforms: { color } },
            }),
          }),
          asynchronous: false,
        })
        cylinderCollection.add(primitive)
      }
    } else {
      for (const point of displayPoints) {
        if (point.gvi == null) continue
        const color = gviToColor(point.gvi)
        const isHighlighted = highlightIds.includes(point.point_id)
        pointCollection.add({
          position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, 10),
          color,
          pixelSize: isHighlighted ? 12 : 6,
          outlineColor: isHighlighted ? Cesium.Color.WHITE : undefined,
          outlineWidth: isHighlighted ? 2 : 0,
          id: point.point_id,
        })
      }
    }
  }, [displayPoints, highlightIds, displayMode])

  // ─── 渲染 3D 道路线条 ──────────────────────────────
  useEffect(() => {
    const roadCollection = roadCollectionRef.current
    if (!roadCollection) return
    roadCollection.removeAll()

    const geojson = roadsDataRef.current
    if (!showRoads || !geojson || geojson.features.length === 0) return

    // 按道路类型分组，减少 Primitive 数量
    const groups: Map<string, Array<{ coords: [number, number][]; avgGvi: number | null }>> = new Map()

    for (const feature of geojson.features) {
      const { road_type, avg_gvi } = feature.properties
      const coords = feature.geometry.coordinates
      if (coords.length < 2) continue

      const key = roadColorMode === 'type' ? road_type : `_gvi_${avg_gvi == null ? 'null' : Math.floor(avg_gvi / 5) * 5}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({ coords, avgGvi: avg_gvi })
    }

    for (const [, group] of groups) {
      if (group.length === 0) continue
      const sample = group[0]

      // 确定颜色
      let color: Cesium.Color
      if (roadColorMode === 'type') {
        // 从道路类型确定颜色
        const firstFeature = geojson.features.find((f) => f.geometry.coordinates === sample.coords)
        const rt = firstFeature?.properties.road_type || 'rc4'
        color = ROAD_TYPE_COLORS[rt] || ROAD_TYPE_COLORS.rc4
      } else {
        color = roadGviColor(sample.avgGvi, 'rc4')
      }

      const instances: Cesium.GeometryInstance[] = group.map(({ coords }) => {
        const positions = coords.map(([lng, lat]) =>
          Cesium.Cartesian3.fromDegrees(lng, lat, 5)
        )
        return new Cesium.GeometryInstance({
          geometry: new Cesium.PolylineGeometry({
            positions,
            width: 2.5,
          }),
        })
      })

      try {
        const primitive = new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.PolylineMaterialAppearance({
            material: new Cesium.Material({
              fabric: { type: 'Color', uniforms: { color } },
            }),
          }),
          asynchronous: true,
        })
        roadCollection.add(primitive)
      } catch {
        // PolylineGeometry 可能因坐标数量问题失败，静默跳过
      }
    }
  }, [showRoads, roadColorMode, roadsDataRef.current])

  // ─── 渲染路线高亮 ─────────────────────────────────
  useEffect(() => {
    const routeCollection = routeCollectionRef.current
    if (!routeCollection) return
    routeCollection.removeAll()
    const viewer = viewerRef.current
    if (!viewer) return

    // 用户路线 — 紫色
    if (routePath.length >= 2) {
      const positions = routePath.map((c) =>
        Cesium.Cartesian3.fromDegrees(c.lng, c.lat, 20)
      )
      viewer.entities.add({
        polyline: {
          positions,
          width: 6,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: Cesium.Color.fromCssColorString('#a855f7'),
          }),
          clampToGround: false,
        },
      })
    }

    // 绿化路线 — 绿色
    if (greenRoutePath.length >= 2) {
      const positions = greenRoutePath.map((c) =>
        Cesium.Cartesian3.fromDegrees(c.lng, c.lat, 25)
      )
      viewer.entities.add({
        polyline: {
          positions,
          width: 6,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: Cesium.Color.fromCssColorString('#22c55e'),
          }),
          clampToGround: false,
        },
      })
    }

    return () => {
      try { viewer.entities.removeAll() } catch { /* ignore */ }
    }
  }, [routePath, greenRoutePath])

  // ─── 飞行漫游 ──────────────────────────────────────
  const handleFlyRoute = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || routePath.length < 2) return
    setIsFlying(true)

    // 沿路线逐段飞行
    let idx = 0
    const flyNext = () => {
      // 检查 viewer 是否仍存活
      const v = viewerRef.current
      if (!v || v.isDestroyed()) {
        setIsFlying(false)
        return
      }
      if (idx >= routePath.length - 1) {
        setIsFlying(false)
        return
      }
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          routePath[idx + 1].lng,
          routePath[idx + 1].lat,
          300,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(
            Math.atan2(
              routePath[idx + 1].lng - routePath[idx].lng,
              routePath[idx + 1].lat - routePath[idx].lat,
            ) * 180 / Math.PI,
          ),
          pitch: Cesium.Math.toRadians(-30),
          roll: 0,
        },
        duration: 2,
        complete: () => {
          idx++
          flyNext()
        },
        cancel: () => setIsFlying(false),
      })
    }
    flyNext()
  }, [routePath])



  // ─── 鼠标悬停 Tooltip ─────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const viewer = viewerRef.current
      if (!viewer || displayMode !== 'points') {
        setHovered(null)
        return
      }
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const scene = viewer.scene
      const pick = scene.pick(new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top))

      if (Cesium.defined(pick) && pick.primitive === pointCollectionRef.current) {
        const pointId = pick.id as number
        const point = pointByIdRef.current.get(pointId)
        if (point) {
          setHovered({ point, x: e.clientX - rect.left, y: e.clientY - rect.top })
          return
        }
      }
      setHovered(null)
    },
    [displayMode],
  )

  // 点击选点
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction(
      (evt: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(evt.position)
        if (
          Cesium.defined(picked) &&
          picked.primitive === pointCollectionRef.current &&
          onPointClick
        ) {
          const pointId = picked.id as number
          const point = pointByIdRef.current.get(pointId)
          if (point) onPointClick(point)
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    )

    return () => { handler.destroy() }
  }, [onPointClick])

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${className}`}
      style={{ minHeight: '400px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHovered(null)}
    >
      {/* ── 3D 工具栏 ──────────────────────────────── */}
      <div className="absolute top-3 right-3 z-40 flex flex-col gap-2">
        {/* 道路开关 */}
        <button
          onClick={() => setShowRoads(!showRoads)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-md ${
            showRoads
              ? 'bg-primary-600 text-white'
              : 'bg-white/90 dark:bg-surface-800/90 text-surface-600 dark:text-surface-300'
          }`}
        >
          🛣️ 道路 {roadsCount > 0 ? `(${roadsCount})` : ''}
        </button>

        {/* 道路配色模式 */}
        {showRoads && (
          <button
            onClick={() => setRoadColorMode(roadColorMode === 'type' ? 'gvi' : 'type')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/90 dark:bg-surface-800/90 text-surface-600 dark:text-surface-300 shadow-md transition-all"
          >
            🎨 {roadColorMode === 'type' ? '按类型' : '按GVI'}
          </button>
        )}

        {/* 飞行漫游 */}
        {routePath.length >= 2 && (
          <button
            onClick={handleFlyRoute}
            disabled={isFlying}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow-md transition-all ${
              isFlying
                ? 'bg-surface-300 text-surface-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            ✈️ {isFlying ? '飞行中...' : '路线漫游'}
          </button>
        )}


      </div>

      {/* ── 加载提示 ────────────────────────────────── */}
      {roadsLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-surface-800/95 rounded-lg shadow-lg px-4 py-2 text-xs text-surface-600 dark:text-surface-300">
          ⏳ 加载道路数据中...
        </div>
      )}

      {/* ── 鼠标悬停 tooltip ────────────────────────── */}
      {hovered && (
        <div
          className="absolute z-50 pointer-events-none bg-gray-900/90 text-white text-xs rounded px-3 py-2 shadow-lg border border-gray-700"
          style={{ left: hovered.x + 15, top: hovered.y - 10, maxWidth: 200 }}
        >
          <div className="font-semibold">采样点 #{hovered.point.point_id}</div>
          <div>
            GVI: <span className={hovered.point.gvi != null && hovered.point.gvi >= 30 ? 'text-green-400' : hovered.point.gvi != null && hovered.point.gvi >= 15 ? 'text-yellow-400' : 'text-red-400'}>
              {hovered.point.gvi != null ? `${hovered.point.gvi.toFixed(2)}%` : 'N/A'}
            </span>
          </div>
          {hovered.point.road_type && (
            <div className="text-gray-400">道路: {hovered.point.road_type}</div>
          )}
        </div>
      )}

      {/* ── 图例 ───────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-40 bg-white/95 dark:bg-surface-800/95 rounded-lg shadow-md p-3 text-xs">
        <div className="font-semibold mb-2 text-gray-700 dark:text-surface-200">3D 绿视率图例</div>
        {displayMode === 'heatmap' ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-8 rounded-sm" style={{ background: '#dc2626' }} />
              <span className="text-gray-600 dark:text-surface-300">&lt;10% (低绿化)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-6 rounded-sm" style={{ background: '#f97316' }} />
              <span className="text-gray-600 dark:text-surface-300">10-20%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: '#eab308' }} />
              <span className="text-gray-600 dark:text-surface-300">20-30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-2 rounded-sm" style={{ background: '#22c55e' }} />
              <span className="text-gray-600 dark:text-surface-300">&gt;30% (高绿化)</span>
            </div>
            <div className="text-gray-400 dark:text-surface-500 mt-1">柱高 = 绿化缺口程度</div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-600 dark:text-surface-300">&gt;30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-gray-600 dark:text-surface-300">15-30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-600 dark:text-surface-300">&lt;15%</span>
            </div>
          </div>
        )}

        {/* 道路图例 */}
        {showRoads && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-surface-600">
            <div className="font-semibold mb-1 text-gray-700 dark:text-surface-200">道路</div>
            {roadColorMode === 'type' ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-amber-500" /><span className="text-gray-600 dark:text-surface-300">快速路</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-blue-500" /><span className="text-gray-600 dark:text-surface-300">主干道</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-purple-500" /><span className="text-gray-600 dark:text-surface-300">次干道</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-gray-500" /><span className="text-gray-600 dark:text-surface-300">支路</span></div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 rounded" style={{ background: 'linear-gradient(to right, #ef4444, #eab308, #22c55e)' }} />
                <span className="text-gray-600 dark:text-surface-300">低→高GVI</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-surface-600 text-gray-400 dark:text-surface-500">
          3D建筑: {cesiumToken ? 'OSM · 地形: Cesium' : 'OSM影像(无Token)'}
        </div>
      </div>
    </div>
  )
}
