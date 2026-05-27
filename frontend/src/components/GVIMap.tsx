import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import type { MapPoint, Season, RouteCoord } from '../types'
import { wgs84ToGcj02 } from '../utils/coordTransform'

/** Escape HTML special chars to prevent XSS in Leaflet bindPopup template literals */
function esc(s: string | number | null | undefined): string {
  if (s == null) return 'N/A'
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type DisplayMode = 'points' | 'heatmap'
export type BaseMap = 'osm' | 'gaode' | 'gaode-satellite'

/** Color scheme preset for heatmap */
export type ColorScheme = 'gvi' | 'r2' | 'cv' | 'diverging'

interface GVIMapProps {
  points: MapPoint[]
  season: Season
  className?: string
  highlightIds?: number[]
  highlightRoute?: number[]
  initialCenter?: { lat: number; lng: number }
  onPointClick?: (point: MapPoint) => void
  onHighlightClick?: (id: number) => void

  /** 显示模式: 散点 / 热力图 */
  displayMode?: DisplayMode

  /** 底图类型 */
  baseMap?: BaseMap

  /** 数据值范围 [min, max]，用于归一化热力图强度。默认 [0, 50] (GVI) */
  valueRange?: [number, number]

  /** 热力图色带方案: gvi(绿高红低), r2(绿高红低0~1), cv(红高绿低), diverging(红负绿正) */
  colorScheme?: ColorScheme

  // 路线规划模式
  planningMode?: boolean
  /** 当前绘制的路点 */
  routeWaypoints?: RouteCoord[]
  /** 额外高亮路线坐标 */
  extraRouteCoords?: RouteCoord[]
  /** 额外路线颜色 */
  extraRouteColor?: string
  /** 地图点击回调 */
  onMapClick?: (lat: number, lng: number) => void
  /** 街景查看回调 */
  onStreetView?: (point: MapPoint) => void
  /** 使用 Canvas 渲染器(默认true)，20万+点需要；纯热力图场景可关闭以避免 clearRect 崩溃 */
  preferCanvas?: boolean
}

export default function GVIMap({
  points,
  season,
  className = '',
  highlightIds = [],
  highlightRoute = [],
  onPointClick,
  onHighlightClick,
  initialCenter,
  displayMode = 'points',
  baseMap = 'osm',
  valueRange = [0, 50],
  colorScheme = 'gvi',
  planningMode = false,
  routeWaypoints = [],
  extraRouteCoords = [],
  extraRouteColor = '#16a34a',
  onMapClick,
  onStreetView,
  preferCanvas = true,
}: GVIMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup | null>(null)
  const heatmapLayerRef = useRef<L.Layer | null>(null)
  const highlightLayer = useRef<L.LayerGroup | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)
  const planningLayer = useRef<L.LayerGroup | null>(null)
  const extraRouteLayer = useRef<L.LayerGroup | null>(null)
  const baseTileRef = useRef<L.TileLayer | null>(null)

  // Refs for values used inside the map-init effect to avoid re-creating the map
  const planningModeRef = useRef(planningMode)
  planningModeRef.current = planningMode
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick

  // Track visibility: when parent toggles hidden→visible, invalidate map size
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (leafletMap.current && el.offsetWidth > 0 && el.offsetHeight > 0) {
        leafletMap.current.invalidateSize()
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const pointById = useRef<Map<number, MapPoint>>(new Map())
  useEffect(() => {
    pointById.current = new Map(points.map((p) => [p.id, p]))
  }, [points])

  const highlightSet = useRef<Set<number>>(new Set(highlightIds))
  useEffect(() => {
    highlightSet.current = new Set(highlightIds)
  }, [highlightIds])

  // 坐标转换：高德底图时将 WGS-84 转为 GCJ-02
  const toMapCoord = useCallback(
    (lat: number, lng: number): [number, number] => {
      if (baseMap === 'gaode' || baseMap === 'gaode-satellite') {
        return wgs84ToGcj02(lat, lng)
      }
      return [lat, lng]
    },
    [baseMap],
  )

  // ─── Effect 1: Map singleton initialisation (deps=[]) ──
  // Strictly only creates the map once. Cleanup removes heatmap first, then map.
  useEffect(() => {
    if (!mapRef.current) return
    // Singleton guard: if a map already exists, skip
    if (leafletMap.current) return

    const map = L.map(mapRef.current, {
      preferCanvas,  // SVG→Canvas: 200K+ circleMarker without lag; 纯热力图场景用 SVG 更安全
    }).setView([32.05, 118.78], 11)
    leafletMap.current = map

    // ── 底图瓦片 ──
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    })

    const gaodeLayer = L.tileLayer(
      'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7',
      { subdomains: '1234', attribution: '© 高德地图', maxZoom: 18 },
    )

    const gaodeSatLayer = L.tileLayer(
      'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=6',
      { subdomains: '1234', attribution: '© 高德地图', maxZoom: 18 },
    )

    // 底图映射
    const baseLayers: Record<string, L.TileLayer> = {
      '🗺 OpenStreetMap': osmLayer,
      '📍 高德地图': gaodeLayer,
      '🛰 高德卫星': gaodeSatLayer,
    }
    const layerMap: Record<BaseMap, L.TileLayer> = {
      osm: osmLayer,
      gaode: gaodeLayer,
      'gaode-satellite': gaodeSatLayer,
    }

    // 默认底图
    layerMap[baseMap].addTo(map)

    // 底图切换控件
    L.control.layers(baseLayers, undefined, { position: 'topright' }).addTo(map)

    markersLayer.current = L.layerGroup().addTo(map)
    highlightLayer.current = L.layerGroup().addTo(map)
    routeLayer.current = L.layerGroup().addTo(map)
    planningLayer.current = L.layerGroup().addTo(map)
    extraRouteLayer.current = L.layerGroup().addTo(map)

    // Map click handler for planning mode — reads from refs so the effect
    // doesn't need planningMode/onMapClick in its dependency array (F3 fix)
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (planningModeRef.current && onMapClickRef.current) {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng)
      }
    })

    // 街景查看事件监听
    const streetViewHandler = (e: Event) => {
      const pointId = (e as CustomEvent).detail?.pointId
      if (pointId != null && onStreetView) {
        const p = pointById.current.get(pointId)
        if (p) onStreetView(p)
      }
    }
    window.addEventListener('ugvis-streetview', streetViewHandler as EventListener)

    // ── Cleanup: 逐层移除后再 map.remove() ──
    return () => {
      window.removeEventListener('ugvis-streetview', streetViewHandler as EventListener)

      if (leafletMap.current) {
        const map = leafletMap.current
        try { map.stop(); } catch { /* ignore */ }

        // 手动逐层移除，避免 Canvas renderer 的 _destroyContainer (delete _ctx) 先执行后，
        // 其他 layer 移除时 _removePath → _requestRedraw 调度 rAF 在 _ctx undefined 时崩溃。
        // preferCanvas=false (SVG renderer) 不受影响，但逐层移除仍是好的实践。
        const allLayers: L.Layer[] = []
        map.eachLayer((layer: L.Layer) => { allLayers.push(layer) })
        for (const layer of allLayers) {
          try { map.removeLayer(layer) } catch { /* already gone */ }
        }

        try { map.remove() } catch { /* ignore */ }
        leafletMap.current = null
      }

      heatmapLayerRef.current = null
      markersLayer.current = null
      highlightLayer.current = null
      routeLayer.current = null
      planningLayer.current = null
      extraRouteLayer.current = null
      baseTileRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Effect 2: Data-driven heatmap update ─────────
  // Watches points/displayMode/valueRange/colorScheme/season → redraws heat layer
  useEffect(() => {
    const map = leafletMap.current
    if (!map) return

    // Step 1: Always remove old heat layer first (cancels internal rAF queue)
    if (heatmapLayerRef.current) {
      try { map.removeLayer(heatmapLayerRef.current) } catch { /* already gone */ }
      heatmapLayerRef.current = null
    }

    // Step 2: If not in heatmap mode, just ensure markers are visible
    if (displayMode !== 'heatmap') return

    // Guard: canvas must have non-zero dimensions before heatLayer can draw
    const container = map.getContainer()
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      // Container not yet laid out — retry after next paint
      const handle = requestAnimationFrame(() => {
        // Re-trigger by no-op; React will re-run this effect on next render
      })
      return () => cancelAnimationFrame(handle)
    }

    // Hide point markers when in heatmap mode
    if (markersLayer.current) markersLayer.current.clearLayers()

    const heatData: [number, number, number][] = []
    const [vMin, vMax] = valueRange
    const vSpan = vMax - vMin
    points.forEach((point) => {
      if (point.gvi == null) return
      let intensity: number
      if (colorScheme === 'diverging') {
        const mid = (vMin + vMax) / 2
        intensity = (point.gvi - mid) / (vMax - mid)
        intensity = Math.max(0, Math.min(1, (intensity + 1) / 2))
      } else {
        intensity = vSpan > 0 ? (point.gvi - vMin) / vSpan : 0
        intensity = Math.max(0, Math.min(1, intensity))
      }
      const [mLat, mLng] = toMapCoord(point.lat, point.lng)
      heatData.push([mLat, mLng, intensity])
    })

    if (heatData.length === 0) return

    const gradients: Record<ColorScheme, Record<number, string>> = {
      gvi: {
        0.0: '#1a1a2e',
        0.2: '#dc2626',
        0.4: '#f97316',
        0.5: '#eab308',
        0.7: '#22c55e',
        0.85: '#16a34a',
        1.0: '#065f46',
      },
      r2: {
        0.0: '#1a1a2e',
        0.2: '#dc2626',
        0.4: '#f97316',
        0.5: '#eab308',
        0.7: '#22c55e',
        0.85: '#16a34a',
        1.0: '#065f46',
      },
      cv: {
        0.0: '#065f46',
        0.2: '#16a34a',
        0.4: '#22c55e',
        0.5: '#eab308',
        0.7: '#f97316',
        0.85: '#dc2626',
        1.0: '#7f1d1d',
      },
      diverging: {
        0.0: '#7f1d1d',
        0.2: '#dc2626',
        0.35: '#fca5a5',
        0.5: '#f5f5f4',
        0.65: '#86efac',
        0.8: '#22c55e',
        1.0: '#065f46',
      },
    }

    const heatLayer = L.heatLayer(heatData, {
      radius: 35,
      blur: 30,
      maxZoom: 17,
      minOpacity: 0.2,
      max: 1,
      gradient: gradients[colorScheme],
    })

    heatLayer.addTo(map)
    heatmapLayerRef.current = heatLayer

    // Cleanup: remove heat layer when deps change
    return () => {
      if (heatmapLayerRef.current && leafletMap.current) {
        try { leafletMap.current.removeLayer(heatmapLayerRef.current) } catch { /* ignore */ }
        heatmapLayerRef.current = null
      }
    }
  }, [points, displayMode, toMapCoord, valueRange, colorScheme, season])

  // ─── Base map switching (add/remove tile layers without rebuilding map) ──
  useEffect(() => {
    const map = leafletMap.current
    if (!map) return

    const tileUrls: Record<BaseMap, { url: string; opts: L.TileLayerOptions }> = {
      osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        opts: { attribution: '© OpenStreetMap', maxZoom: 19 },
      },
      gaode: {
        url: 'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7',
        opts: { subdomains: '1234', attribution: '© 高德地图', maxZoom: 18 } as L.TileLayerOptions,
      },
      'gaode-satellite': {
        url: 'https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=6',
        opts: { subdomains: '1234', attribution: '© 高德地图', maxZoom: 18 } as L.TileLayerOptions,
      },
    }

    // Remove old tile layer
    if (baseTileRef.current) {
      map.removeLayer(baseTileRef.current)
    }

    const { url, opts } = tileUrls[baseMap]
    const tile = L.tileLayer(url, opts)
    tile.addTo(map)
    baseTileRef.current = tile
    tile.bringToBack()  // Keep tile layer behind all overlays
  }, [baseMap])

  // ─── Cursor style ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.style.cursor = planningMode ? 'crosshair' : ''
  }, [planningMode])

  // ─── Normal markers ──────────────────────────────────
  useEffect(() => {
    if (!markersLayer.current || !leafletMap.current) return
    markersLayer.current.clearLayers()

    const map = leafletMap.current
    const isZoomedIn = map.getZoom() >= 13  // Only bind popups at zoom 13+

    points.forEach((point) => {
      if (highlightSet.current.has(point.id)) return
      const gvi = point.gvi
      if (gvi == null) return

      const [mLat, mLng] = toMapCoord(point.lat, point.lng)
      const color = gvi > 30 ? '#16a34a' : gvi > 15 ? '#eab308' : '#dc2626'
      const radius = Math.max(3, Math.min(8, gvi / 5))

      const circle = L.circleMarker([mLat, mLng], {
        radius,
        fillColor: color,
        color: '#fff',
        weight: 0.5,
        opacity: 0.8,
        fillOpacity: 0.6,
      })

      // Bind popup only when zoomed in to reduce memory for 200K+ points
      if (isZoomedIn) {
        circle.bindPopup(`
          <div style="min-width:180px;font-size:13px">
            <p><strong>采样点 ${esc(point.id)}</strong></p>
            <p>GVI: <span style="color:${color};font-weight:600">${gvi.toFixed(2)}%</span></p>
            <p>NDVI: ${point.ndvi != null ? point.ndvi.toFixed(2) : 'N/A'}</p>
            <p>道路: ${esc(point.road_type)}</p>
            <hr style="margin:4px 0;border-color:#eee">
            <p style="font-size:11px;color:#666">坐标: ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</p>
            <p style="font-size:11px;color:#059669;cursor:pointer;margin-top:4px" onclick="window.dispatchEvent(new CustomEvent('ugvis-streetview',{detail:{pointId:${point.id}}}))">📸 查看街景</p>
          </div>
        `)
      }

      if (onPointClick) {
        circle.on('click', () => onPointClick(point))
      }

      markersLayer.current?.addLayer(circle)
    })
  }, [points, season, highlightIds, onPointClick, toMapCoord])

  // ─── Highlight markers ───────────────────────────────
  useEffect(() => {
    if (!highlightLayer.current || !leafletMap.current) return
    highlightLayer.current.clearLayers()

    const highlightPoints = points.filter((p) => highlightSet.current.has(p.id))
    if (highlightPoints.length === 0) return

    leafletMap.current!.setView([highlightPoints[0].lat, highlightPoints[0].lng], 14, {
      animate: false,  // R15 fix: disable animation to prevent drag conflict
    })

    highlightPoints.forEach((point) => {
      const [mLat, mLng] = toMapCoord(point.lat, point.lng)
      const pulseIcon = L.divIcon({
        html: `
          <div style="position:relative;width:20px;height:20px">
            <div style="position:absolute;inset:-4px;border-radius:50%;background:rgba(59,130,246,0.3);animation:pulse-ring 1.5s ease-out infinite"></div>
            <div style="position:absolute;inset:2px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 2px 6px rgba(59,130,246,0.5)"></div>
          </div>
          <style>@keyframes pulse-ring{0%{transform:scale(0.8);opacity:1}100%{transform:scale(1.8);opacity:0}}</style>
        `,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })

      const marker = L.marker([mLat, mLng], { icon: pulseIcon })
      marker.bindPopup(`
        <div style="min-width:180px;font-size:13px"><p><strong>📌 薄弱点 ${esc(point.id)}</strong></p>
          <p>GVI: <span style="color:#dc2626;font-weight:600">${point.gvi != null ? point.gvi.toFixed(2) + '%' : 'N/A'}</span></p>
          <p>道路: ${esc(point.road_type)}</p>
          <hr style="margin:4px 0;border-color:#eee">
          <p style="font-size:11px;color:#3b82f6;cursor:pointer" onclick="window.dispatchEvent(new CustomEvent('ugvis-ask-ai',{detail:{pointId:${point.id}}}))">🤖 询问AI关于此点</p>
          <p style="font-size:11px;color:#059669;cursor:pointer;margin-top:2px" onclick="window.dispatchEvent(new CustomEvent('ugvis-streetview',{detail:{pointId:${point.id}}}))">📸 查看街景</p>
        </div>
      `)

      if (onHighlightClick) {
        marker.on('click', () => onHighlightClick(point.id))
      }

      highlightLayer.current?.addLayer(marker)
    })
  }, [points, highlightIds, onHighlightClick, toMapCoord])

  // ─── Route drawing ───────────────────────────────────
  useEffect(() => {
    if (!routeLayer.current || !leafletMap.current) return
    routeLayer.current.clearLayers()

    if (highlightRoute.length < 2) return

    const routePoints: L.LatLng[] = []
    highlightRoute.forEach((id) => {
      const p = pointById.current.get(id)
      if (p) {
        const [mLat, mLng] = toMapCoord(p.lat, p.lng)
        routePoints.push(L.latLng(mLat, mLng))
      }
    })

    if (routePoints.length < 2) return

    const polyline = L.polyline(routePoints, {
      color: '#8b5cf6',
      weight: 3,
      dashArray: '8 6',
      opacity: 0.85,
    })
    routeLayer.current.addLayer(polyline)

    routePoints.forEach((latlng, idx) => {
      const numIcon = L.divIcon({
        html: `<div style="background:#8b5cf6;color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${idx + 1}</div>`,
        className: '',
        iconAnchor: [11, 11],
      })
      const marker = L.marker(latlng, { icon: numIcon })
      routeLayer.current?.addLayer(marker)
    })

    const bounds = L.latLngBounds(routePoints)
    leafletMap.current.fitBounds(bounds, { padding: [40, 40], animate: true })
  }, [highlightRoute, toMapCoord])

  // ─── Planning waypoints ──────────────────────────────
  useEffect(() => {
    if (!planningLayer.current || !leafletMap.current) return
    planningLayer.current.clearLayers()

    if (routeWaypoints.length === 0) return

    const latlngs: L.LatLng[] = []

    routeWaypoints.forEach((wp, idx) => {
      const [mLat, mLng] = toMapCoord(wp.lat, wp.lng)
      latlngs.push(L.latLng(mLat, mLng))

      // Numbered waypoint marker
      const wpIcon = L.divIcon({
        html: `<div style="
          background:#059669;color:#fff;
          width:26px;height:26px;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:bold;
          border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
        ">${idx + 1}</div>`,
        className: '',
        iconAnchor: [13, 13],
      })

      const marker = L.marker([mLat, mLng], { icon: wpIcon })
      marker.bindPopup(`路点 ${idx + 1}<br/>${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`)
      planningLayer.current?.addLayer(marker)
    })

    // Draw line connecting waypoints
    if (latlngs.length >= 2) {
      const polyline = L.polyline(latlngs, {
        color: '#059669',
        weight: 4,
        opacity: 0.8,
      })
      planningLayer.current.addLayer(polyline)

      // Fit waypoints in view
      const bounds = L.latLngBounds(latlngs)
      leafletMap.current?.fitBounds(bounds, { padding: [60, 60], animate: true })
    }
  }, [routeWaypoints, toMapCoord])

  // ─── Extra route (green route) ──────────────────────
  useEffect(() => {
    if (!extraRouteLayer.current || !leafletMap.current) return
    extraRouteLayer.current.clearLayers()

    if (extraRouteCoords.length < 2) return

    const latlngs = extraRouteCoords.map((c) => {
      const [mLat, mLng] = toMapCoord(c.lat, c.lng)
      return L.latLng(mLat, mLng)
    })

    const polyline = L.polyline(latlngs, {
      color: extraRouteColor,
      weight: 3,
      dashArray: '6 4',
      opacity: 0.7,
    })
    extraRouteLayer.current.addLayer(polyline)

    // Start/end markers
    const startIcon = L.divIcon({
      html: '<div style="background:#059669;color:#fff;width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3)">🟢</div>',
      className: '',
      iconAnchor: [8, 8],
    })
    const endIcon = L.divIcon({
      html: '<div style="background:#dc2626;color:#fff;width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3)">🔴</div>',
      className: '',
      iconAnchor: [8, 8],
    })

    L.marker([latlngs[0].lat, latlngs[0].lng], { icon: startIcon }).addTo(extraRouteLayer.current)
    if (latlngs.length > 1) {
      L.marker([latlngs[latlngs.length - 1].lat, latlngs[latlngs.length - 1].lng], { icon: endIcon }).addTo(extraRouteLayer.current)
    }
  }, [extraRouteCoords, extraRouteColor, toMapCoord])

  // ─── Fit bounds / center ─────────────────────────────
  useEffect(() => {
    if (!leafletMap.current || points.length === 0) return
    if (routeWaypoints.length > 0) return // planning mode handles its own fit
    if (initialCenter) {
      leafletMap.current.setView([initialCenter.lat, initialCenter.lng], 14, { animate: false })  // R15 fix: no animation
      return
    }
    if (highlightIds.length > 0 || highlightRoute.length > 0) return
    const bounds = L.latLngBounds(points.map((p) => {
      const [mLat, mLng] = toMapCoord(p.lat, p.lng)
      return [mLat, mLng] as [number, number]
    }))
    leafletMap.current.fitBounds(bounds, { padding: [20, 20] })
  }, [points, season, highlightIds, highlightRoute, initialCenter, routeWaypoints, toMapCoord])

  return (
    <div className={`relative h-full ${className}`}>
      <div ref={mapRef} className='w-full h-full rounded-lg' />
      {/* GVI Color Legend */}
      <div className='absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 z-[1000] text-xs'>
        {displayMode === 'heatmap' ? (
          <>
            <p className='font-medium text-gray-700 mb-1'>
              {colorScheme === 'r2' ? 'R² 热力图' : colorScheme === 'cv' ? 'CV 热力图' : colorScheme === 'diverging' ? '差值热力图' : 'GVI 热力图'}
            </p>
            <div className='flex items-center gap-1'>
              <span className='text-gray-500'>{valueRange[0]}</span>
              <div className='flex h-3 w-32 rounded-sm overflow-hidden'>
                {colorScheme === 'cv' ? (
                  <>
                    <div className='flex-1' style={{ background: '#065f46' }} />
                    <div className='flex-1' style={{ background: '#16a34a' }} />
                    <div className='flex-1' style={{ background: '#22c55e' }} />
                    <div className='flex-1' style={{ background: '#eab308' }} />
                    <div className='flex-1' style={{ background: '#f97316' }} />
                    <div className='flex-1' style={{ background: '#dc2626' }} />
                    <div className='flex-1' style={{ background: '#7f1d1d' }} />
                  </>
                ) : colorScheme === 'diverging' ? (
                  <>
                    <div className='flex-1' style={{ background: '#7f1d1d' }} />
                    <div className='flex-1' style={{ background: '#dc2626' }} />
                    <div className='flex-1' style={{ background: '#fca5a5' }} />
                    <div className='flex-1' style={{ background: '#f5f5f4' }} />
                    <div className='flex-1' style={{ background: '#86efac' }} />
                    <div className='flex-1' style={{ background: '#22c55e' }} />
                    <div className='flex-1' style={{ background: '#065f46' }} />
                  </>
                ) : (
                  <>
                    <div className='flex-1' style={{ background: '#1a1a2e' }} />
                    <div className='flex-1' style={{ background: '#dc2626' }} />
                    <div className='flex-1' style={{ background: '#f97316' }} />
                    <div className='flex-1' style={{ background: '#eab308' }} />
                    <div className='flex-1' style={{ background: '#22c55e' }} />
                    <div className='flex-1' style={{ background: '#16a34a' }} />
                    <div className='flex-1' style={{ background: '#065f46' }} />
                  </>
                )}
              </div>
              <span className='text-gray-500'>{valueRange[1]}{colorScheme === 'r2' ? '' : '%'}</span>
            </div>
            <div className='flex justify-between mt-0.5'>
              {colorScheme === 'cv' ? (
                <>
                  <span className='text-green-700'>稳定</span>
                  <span className='text-red-600'>不稳定</span>
                </>
              ) : colorScheme === 'diverging' ? (
                <>
                  <span className='text-red-600'>冬&gt;夏</span>
                  <span className='text-green-700'>夏&gt;冬</span>
                </>
              ) : colorScheme === 'r2' ? (
                <>
                  <span className='text-red-500'>拟合差</span>
                  <span className='text-green-700'>拟合好</span>
                </>
              ) : (
                <>
                  <span className='text-red-500'>薄弱</span>
                  <span className='text-green-700'>优质</span>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <p className='font-medium text-gray-700 mb-1'>GVI 色带</p>
            <div className='flex items-center gap-1'>
              <span className='text-gray-500'>0%</span>
              <div className='flex h-3 w-24 rounded-sm overflow-hidden'>
                <div className='flex-1 bg-red-500' />
                <div className='flex-1 bg-yellow-500' />
                <div className='flex-1 bg-green-500' />
              </div>
              <span className='text-gray-500'>30%+</span>
            </div>
            <div className='flex justify-between mt-0.5'>
              <span className='text-red-500'>低</span>
              <span className='text-green-600'>高</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
