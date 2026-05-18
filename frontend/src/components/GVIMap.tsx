import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import type { MapPoint, Season, RouteCoord } from '../types'

export type DisplayMode = 'points' | 'heatmap'
export type BaseMap = 'osm' | 'gaode' | 'gaode-satellite'

// ─── WGS-84 → GCJ-02 坐标转换 ─────────────────────────
// 高德地图使用 GCJ-02 坐标系，需将 WGS-84 数据偏移
const PI = Math.PI
const A = 6378245.0 // 长半轴
const EE = 0.006693421622965943 // 扁率

function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

function wgs84ToGcj02(lat: number, lng: number): [number, number] {
  if (outOfChina(lat, lng)) return [lat, lng]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return [lat + dLat, lng + dLng]
}

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
  planningMode = false,
  routeWaypoints = [],
  extraRouteCoords = [],
  extraRouteColor = '#16a34a',
  onMapClick,
  onStreetView,
}: GVIMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup | null>(null)
  const heatmapLayerRef = useRef<L.Layer | null>(null)
  const highlightLayer = useRef<L.LayerGroup | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)
  const planningLayer = useRef<L.LayerGroup | null>(null)
  const extraRouteLayer = useRef<L.LayerGroup | null>(null)

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

  // ─── Map initialisation ──────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    leafletMap.current = L.map(mapRef.current).setView([32.05, 118.78], 11)

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
    layerMap[baseMap].addTo(leafletMap.current)

    // 底图切换控件
    L.control.layers(baseLayers, undefined, { position: 'topright' }).addTo(leafletMap.current)

    markersLayer.current = L.layerGroup().addTo(leafletMap.current)
    highlightLayer.current = L.layerGroup().addTo(leafletMap.current)
    routeLayer.current = L.layerGroup().addTo(leafletMap.current)
    planningLayer.current = L.layerGroup().addTo(leafletMap.current)
    extraRouteLayer.current = L.layerGroup().addTo(leafletMap.current)

    // Map click handler for planning mode
    leafletMap.current.on('click', (e: L.LeafletMouseEvent) => {
      if (planningMode && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng)
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

    const cleanupStreetView = () => {
      window.removeEventListener('ugvis-streetview', streetViewHandler as EventListener)
    }

    return () => {
      cleanupStreetView()
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningMode, onMapClick])

  // ─── Heatmap layer ──────────────────────────────────
  const renderHeatmap = useCallback(() => {
    if (!leafletMap.current) return

    // Remove existing heatmap
    if (heatmapLayerRef.current) {
      leafletMap.current.removeLayer(heatmapLayerRef.current)
      heatmapLayerRef.current = null
    }

    if (displayMode !== 'heatmap') return

    const heatData: [number, number, number][] = []
    points.forEach((point) => {
      if (point.gvi == null) return
      // Normalize GVI to 0-1 range for heat intensity
      // Typical GVI range: 0-50, cap at 50 for normalization
      const intensity = Math.min(point.gvi / 50, 1)
      const [mLat, mLng] = toMapCoord(point.lat, point.lng)
      heatData.push([mLat, mLng, intensity])
    })

    if (heatData.length === 0) return

    const heatLayer = L.heatLayer(heatData, {
      radius: 20,
      blur: 15,
      maxZoom: 17,
      minOpacity: 0.3,
      max: 1,
      gradient: {
        0.0: '#1a1a2e',   // very low → dark
        0.2: '#dc2626',   // low → red
        0.4: '#f97316',   // medium-low → orange
        0.5: '#eab308',   // medium → yellow
        0.7: '#22c55e',   // good → green
        0.85: '#16a34a',  // high → darker green
        1.0: '#065f46',   // very high → deep green
      },
    })

    heatLayer.addTo(leafletMap.current)
    heatmapLayerRef.current = heatLayer
  }, [points, displayMode, toMapCoord])

  // ─── Display mode switching ───────────────────────────
  useEffect(() => {
    if (!leafletMap.current) return

    if (displayMode === 'heatmap') {
      // Hide point markers, show heatmap
      if (markersLayer.current) markersLayer.current.clearLayers()
      renderHeatmap()
    } else {
      // Remove heatmap, markers will re-render via their own useEffect
      if (heatmapLayerRef.current) {
        leafletMap.current.removeLayer(heatmapLayerRef.current)
        heatmapLayerRef.current = null
      }
    }
  }, [displayMode, renderHeatmap, points, season])

  // ─── Cursor style ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.style.cursor = planningMode ? 'crosshair' : ''
  }, [planningMode])

  // ─── Normal markers ──────────────────────────────────
  useEffect(() => {
    if (!markersLayer.current || !leafletMap.current) return
    markersLayer.current.clearLayers()

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

      circle.bindPopup(`
        <div style="min-width:180px;font-size:13px">
          <p><strong>采样点 ${point.id}</strong></p>
          <p>GVI: <span style="color:${color};font-weight:600">${gvi.toFixed(2)}%</span></p>
          <p>NDVI: ${point.ndvi != null ? point.ndvi.toFixed(2) : 'N/A'}</p>
          <p>道路: ${point.road_type || 'N/A'}</p>
          <hr style="margin:4px 0;border-color:#eee">
          <p style="font-size:11px;color:#666">坐标: ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</p>
          <p style="font-size:11px;color:#059669;cursor:pointer;margin-top:4px" onclick="window.dispatchEvent(new CustomEvent('ugvis-streetview',{detail:{pointId:${point.id}}}))">📸 查看街景</p>
        </div>
      `)

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

    leafletMap.current.setView([highlightPoints[0].lat, highlightPoints[0].lng], 14, {
      animate: true,
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
        <div style="min-width:180px;font-size:13px">
          <p><strong>📌 薄弱点 ${point.id}</strong></p>
          <p>GVI: <span style="color:#dc2626;font-weight:600">${point.gvi != null ? point.gvi.toFixed(2) + '%' : 'N/A'}</span></p>
          <p>道路: ${point.road_type || 'N/A'}</p>
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
    if (!planningLayer.current) return
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
    if (!extraRouteLayer.current) return
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
      leafletMap.current.setView([initialCenter.lat, initialCenter.lng], 14, { animate: true })
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
    <div className={`relative ${className}`}>
      <div ref={mapRef} className='w-full h-full rounded-lg' />
      {/* GVI Color Legend */}
      <div className='absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 z-[1000] text-xs'>
        {displayMode === 'heatmap' ? (
          <>
            <p className='font-medium text-gray-700 mb-1'>GVI 热力图</p>
            <div className='flex items-center gap-1'>
              <span className='text-gray-500'>0%</span>
              <div className='flex h-3 w-32 rounded-sm overflow-hidden'>
                <div className='flex-1' style={{ background: '#1a1a2e' }} />
                <div className='flex-1' style={{ background: '#dc2626' }} />
                <div className='flex-1' style={{ background: '#f97316' }} />
                <div className='flex-1' style={{ background: '#eab308' }} />
                <div className='flex-1' style={{ background: '#22c55e' }} />
                <div className='flex-1' style={{ background: '#16a34a' }} />
                <div className='flex-1' style={{ background: '#065f46' }} />
              </div>
              <span className='text-gray-500'>50%+</span>
            </div>
            <div className='flex justify-between mt-0.5'>
              <span className='text-red-500'>薄弱</span>
              <span className='text-green-700'>优质</span>
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
