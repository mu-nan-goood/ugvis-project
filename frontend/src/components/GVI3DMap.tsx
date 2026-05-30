import { useEffect, useRef, useState, useCallback } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/CesiumUnminified/Widgets/widgets.css'
import type { MapPoint, Season } from '../types'

export type DisplayMode3D = 'points' | 'heatmap'

interface GVI3DMapProps {
  points: MapPoint[]
  season: Season
  className?: string
  highlightIds?: number[]
  initialCenter?: { lat: number; lng: number }
  onPointClick?: (point: MapPoint) => void
  displayMode?: DisplayMode3D
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
}: GVI3DMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const pointCollectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null)
  const cylinderCollectionRef = useRef<Cesium.PrimitiveCollection | null>(null)
  const pointByIdRef = useRef<Map<number, MapPoint>>(new Map())
  const [hovered, setHovered] = useState<HoveredPoint | null>(null)

  // Cesium ion Token（可选，无 Token 用 OSM 影像）
  const cesiumToken = import.meta.env.VITE_CESIUM_TOKEN as string | undefined

  // 性能：点数限制
  const displayPoints = displayMode === 'heatmap'
    ? points.slice(0, 15000)
    : points.slice(0, 20000)

  // 更新索引
  useEffect(() => {
    pointByIdRef.current = new Map(points.map((p) => [p.id, p]))
  }, [points])

  // ─── 初始化 Cesium Viewer ──────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    // 使用环境变量中的 Cesium ion Token（可选，无 Token 也能运行）
    if (cesiumToken) {
      Cesium.Ion.defaultAccessToken = cesiumToken
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      // 无 ion Token 时使用 OpenStreetMap 影像，无需任何账号
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

    // OSM Buildings 3D Tiles（需要 ion Token）
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

    viewerRef.current = viewer

    // 点集合
    const pointCollection = new Cesium.PointPrimitiveCollection()
    viewer.scene.primitives.add(pointCollection)
    pointCollectionRef.current = pointCollection

    // 柱体集合
    const cylinderCollection = new Cesium.PrimitiveCollection()
    viewer.scene.primitives.add(cylinderCollection)
    cylinderCollectionRef.current = cylinderCollection

    return () => {
      try {
        viewer.scene.primitives.removeAll()
      } catch { /* ignore */ }
      try {
        viewer.entities.removeAll()
      } catch { /* ignore */ }
      try {
        viewer.destroy()
      } catch { /* ignore */ }
      viewerRef.current = null
      pointCollectionRef.current = null
      cylinderCollectionRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cesiumToken must NOT trigger viewer rebuild
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
    viewer.entities.removeAll()

    if (displayMode === 'heatmap') {
      // 热力柱体模式：低GVI区域用柱体"拔高"表示
      for (const point of displayPoints) {
        if (point.gvi == null) continue
        const maxHeight = 500
        const normalizedGvi = Math.min(point.gvi / 30, 1)
        const height = maxHeight * (1 - normalizedGvi)

        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, Math.max(height, 1) / 2),
          cylinder: {
            length: Math.max(height, 1),
            topRadius: 15,
            bottomRadius: 15,
            material: heatmapColor(point.gvi).withAlpha(0.7),
          },
        })
      }
    } else {
      // 散点模式
      for (const point of displayPoints) {
        if (point.gvi == null) continue
        const color = gviToColor(point.gvi)
        const isHighlighted = highlightIds.includes(point.id)
        pointCollection.add({
          position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, 10),
          color,
          pixelSize: isHighlighted ? 12 : 6,
          outlineColor: isHighlighted ? Cesium.Color.WHITE : undefined,
          outlineWidth: isHighlighted ? 2 : 0,
          id: point.id,
        })
      }
    }
  }, [displayPoints, highlightIds, displayMode])

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
      {/* 鼠标悬停 tooltip */}
      {hovered && (
        <div
          className="absolute z-50 pointer-events-none bg-gray-900/90 text-white text-xs rounded px-3 py-2 shadow-lg border border-gray-700"
          style={{ left: hovered.x + 15, top: hovered.y - 10, maxWidth: 200 }}
        >
          <div className="font-semibold">采样点 #{hovered.point.id}</div>
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

      {/* 图例 */}
      <div className="absolute bottom-4 left-4 z-40 bg-white/95 rounded-lg shadow-md p-3 text-xs">
        <div className="font-semibold mb-2 text-gray-700">3D 绿视率图例</div>
        {displayMode === 'heatmap' ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-8 rounded-sm" style={{ background: '#dc2626' }} />
              <span className="text-gray-600">&lt;10% (低绿化)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-6 rounded-sm" style={{ background: '#f97316' }} />
              <span className="text-gray-600">10-20%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: '#eab308' }} />
              <span className="text-gray-600">20-30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-2 rounded-sm" style={{ background: '#22c55e' }} />
              <span className="text-gray-600">&gt;30% (高绿化)</span>
            </div>
            <div className="text-gray-400 mt-1">柱高 = 绿化缺口程度</div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-600">&gt;30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-gray-600">15-30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-600">&lt;15%</span>
            </div>
          </div>
        )}
        <div className="mt-2 pt-2 border-t text-gray-400">
          3D建筑: {cesiumToken ? 'OSM · 地形: Cesium' : 'OSM影像(无Token)'}
        </div>
      </div>
    </div>
  )
}
