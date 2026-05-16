import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapPoint, Season, RouteCoord } from '../types'

interface GVIMapProps {
  points: MapPoint[]
  season: Season
  className?: string
  highlightIds?: number[]
  highlightRoute?: number[]
  initialCenter?: { lat: number; lng: number }
  onPointClick?: (point: MapPoint) => void
  onHighlightClick?: (id: number) => void

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
  planningMode = false,
  routeWaypoints = [],
  extraRouteCoords = [],
  extraRouteColor = '#16a34a',
  onMapClick,
}: GVIMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup | null>(null)
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

  // ─── Map initialisation ──────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    leafletMap.current = L.map(mapRef.current).setView([32.05, 118.78], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(leafletMap.current)

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

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningMode, onMapClick])

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

      const color = gvi > 30 ? '#16a34a' : gvi > 15 ? '#eab308' : '#dc2626'
      const radius = Math.max(3, Math.min(8, gvi / 5))

      const circle = L.circleMarker([point.lat, point.lng], {
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
        </div>
      `)

      if (onPointClick) {
        circle.on('click', () => onPointClick(point))
      }

      markersLayer.current?.addLayer(circle)
    })
  }, [points, season, highlightIds, onPointClick])

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

      const marker = L.marker([point.lat, point.lng], { icon: pulseIcon })
      marker.bindPopup(`
        <div style="min-width:180px;font-size:13px">
          <p><strong>📌 薄弱点 ${point.id}</strong></p>
          <p>GVI: <span style="color:#dc2626;font-weight:600">${point.gvi != null ? point.gvi.toFixed(2) + '%' : 'N/A'}</span></p>
          <p>道路: ${point.road_type || 'N/A'}</p>
          <hr style="margin:4px 0;border-color:#eee">
          <p style="font-size:11px;color:#3b82f6;cursor:pointer" onclick="window.dispatchEvent(new CustomEvent('ugvis-ask-ai',{detail:{pointId:${point.id}}}))">🤖 询问AI关于此点</p>
        </div>
      `)

      if (onHighlightClick) {
        marker.on('click', () => onHighlightClick(point.id))
      }

      highlightLayer.current?.addLayer(marker)
    })
  }, [points, highlightIds, onHighlightClick])

  // ─── Route drawing ───────────────────────────────────
  useEffect(() => {
    if (!routeLayer.current || !leafletMap.current) return
    routeLayer.current.clearLayers()

    if (highlightRoute.length < 2) return

    const routePoints: L.LatLng[] = []
    highlightRoute.forEach((id) => {
      const p = pointById.current.get(id)
      if (p) routePoints.push(L.latLng(p.lat, p.lng))
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
  }, [highlightRoute])

  // ─── Planning waypoints ──────────────────────────────
  useEffect(() => {
    if (!planningLayer.current) return
    planningLayer.current.clearLayers()

    if (routeWaypoints.length === 0) return

    const latlngs: L.LatLng[] = []

    routeWaypoints.forEach((wp, idx) => {
      latlngs.push(L.latLng(wp.lat, wp.lng))

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

      const marker = L.marker([wp.lat, wp.lng], { icon: wpIcon })
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
  }, [routeWaypoints])

  // ─── Extra route (green route) ──────────────────────
  useEffect(() => {
    if (!extraRouteLayer.current) return
    extraRouteLayer.current.clearLayers()

    if (extraRouteCoords.length < 2) return

    const latlngs = extraRouteCoords.map((c) => L.latLng(c.lat, c.lng))

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
  }, [extraRouteCoords, extraRouteColor])

  // ─── Fit bounds / center ─────────────────────────────
  useEffect(() => {
    if (!leafletMap.current || points.length === 0) return
    if (routeWaypoints.length > 0) return // planning mode handles its own fit
    if (initialCenter) {
      leafletMap.current.setView([initialCenter.lat, initialCenter.lng], 14, { animate: true })
      return
    }
    if (highlightIds.length > 0 || highlightRoute.length > 0) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    leafletMap.current.fitBounds(bounds, { padding: [20, 20] })
  }, [points, season, highlightIds, highlightRoute, initialCenter, routeWaypoints])

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className='w-full h-full rounded-lg' />
      {/* GVI Color Legend */}
      <div className='absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 z-[1000] text-xs'>
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
      </div>
    </div>
  )
}
