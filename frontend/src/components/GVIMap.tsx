import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapPoint, Season } from '../types'

interface GVIMapProps {
  points: MapPoint[]
  season: Season
  className?: string
  /** 要高亮的 map point ids（蓝色高亮 + 脉冲动画） */
  highlightIds?: number[]
  /** 按顺序排列的 point ids，用于绘制路线（紫色虚线） */
  highlightRoute?: number[]
  /** 点击普通点位时的回调（不含高亮点） */
  onPointClick?: (point: MapPoint) => void
  /** 点击高亮点时的回调 */
  onHighlightClick?: (id: number) => void
  /** 初始中心坐标（无高亮点时使用） */
  initialCenter?: { lat: number; lng: number }
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
}: GVIMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup | null>(null)
  const highlightLayer = useRef<L.LayerGroup | null>(null)
  const routeLayer = useRef<L.LayerGroup | null>(null)

  // Build id→point lookup for route
  const pointById = useRef<Map<number, MapPoint>>(new Map())
  useEffect(() => {
    pointById.current = new Map(points.map((p) => [p.id, p]))
  }, [points])

  // Build highlight set
  const highlightSet = useRef<Set<number>>(new Set(highlightIds))
  useEffect(() => {
    highlightSet.current = new Set(highlightIds)
  }, [highlightIds])

  // ─── Map initialisation (once) ───────────────────────
  useEffect(() => {
    if (!mapRef.current) return

    leafletMap.current = L.map(mapRef.current).setView([32.05, 118.78], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(leafletMap.current)

    markersLayer.current = L.layerGroup().addTo(leafletMap.current)
    highlightLayer.current = L.layerGroup().addTo(leafletMap.current)
    routeLayer.current = L.layerGroup().addTo(leafletMap.current)

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
  }, [])

  // ─── Normal markers ──────────────────────────────────
  useEffect(() => {
    if (!markersLayer.current || !leafletMap.current) return
    markersLayer.current.clearLayers()

    points.forEach((point) => {
      if (highlightSet.current.has(point.id)) return // skip highlights
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
        <div style="min-width:150px">
          <p><strong>采样点 ${point.id}</strong></p>
          <p>GVI: ${gvi.toFixed(2)}%</p>
          <p>NDVI: ${point.ndvi != null ? point.ndvi.toFixed(2) : 'N/A'}</p>
          <p>道路类型: ${point.road_type || 'N/A'}</p>
        </div>
      `)

      if (onPointClick) {
        circle.on('click', () => onPointClick(point))
      }

      markersLayer.current?.addLayer(circle)
    })
  }, [points, season, highlightIds, onPointClick])

  // ─── Highlight markers (blue + pulse) ─────────────────
  useEffect(() => {
    if (!highlightLayer.current || !leafletMap.current) return
    highlightLayer.current.clearLayers()

    const highlightPoints = points.filter((p) => highlightSet.current.has(p.id))
    if (highlightPoints.length === 0) return

    // Center on first highlight
    leafletMap.current.setView([highlightPoints[0].lat, highlightPoints[0].lng], 14, {
      animate: true,
    })

    highlightPoints.forEach((point) => {
      // Pulsing blue marker
      const pulseIcon = L.divIcon({
        html: `
          <div style="
            position:relative;
            width:20px;height:20px;
          ">
            <div style="
              position:absolute;inset:-4px;
              border-radius:50%;
              background:rgba(59,130,246,0.3);
              animation:pulse-ring 1.5s ease-out infinite;
            "></div>
            <div style="
              position:absolute;inset:2px;
              border-radius:50%;
              background:#3b82f6;
              border:2px solid #fff;
              box-shadow:0 2px 6px rgba(59,130,246,0.5);
            "></div>
          </div>
          <style>@keyframes pulse-ring{0%{transform:scale(0.8);opacity:1}100%{transform:scale(1.8);opacity:0}}</style>
        `,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })

      const marker = L.marker([point.lat, point.lng], { icon: pulseIcon })

      marker.bindPopup(`
        <div style="min-width:150px">
          <p><strong>\u{1F4CD} 薄弱点 ${point.id}</strong></p>
          <p>GVI: ${point.gvi != null ? point.gvi.toFixed(2) + '%' : 'N/A'}</p>
          <p>道路类型: ${point.road_type || 'N/A'}</p>
        </div>
      `)

      if (onHighlightClick) {
        marker.on('click', () => onHighlightClick(point.id))
      }

      highlightLayer.current?.addLayer(marker)
    })
  }, [points, highlightIds, onHighlightClick])

  // ─── Route drawing ──────────────────────────────────
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

    // Purple dashed line
    const polyline = L.polyline(routePoints, {
      color: '#8b5cf6',
      weight: 3,
      dashArray: '8 6',
      opacity: 0.85,
    })
    routeLayer.current.addLayer(polyline)

    // Numbered icons along route
    routePoints.forEach((latlng, idx) => {
      const numIcon = L.divIcon({
        html: `<div style="
          background:#8b5cf6;
          color:#fff;
          width:22px;height:22px;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:bold;
          border:2px solid #fff;
          box-shadow:0 2px 4px rgba(0,0,0,0.3);
        ">${idx + 1}</div>`,
        className: '',
        iconAnchor: [11, 11],
      })
      const marker = L.marker(latlng, { icon: numIcon })
      routeLayer.current?.addLayer(marker)
    })

    // Fit route in view
    const bounds = L.latLngBounds(routePoints)
    leafletMap.current.fitBounds(bounds, { padding: [40, 40], animate: true })
  }, [highlightRoute])

  // ─── Fit bounds / center when no highlight/route ────
  useEffect(() => {
    if (!leafletMap.current || points.length === 0) return
    // Prefer initCenter if provided
    if (initialCenter) {
      leafletMap.current.setView([initialCenter.lat, initialCenter.lng], 14, { animate: true })
      return
    }
    if (highlightIds.length > 0 || highlightRoute.length > 0) return
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
    leafletMap.current.fitBounds(bounds, { padding: [20, 20] })
  }, [points, season, highlightIds, highlightRoute, initialCenter])

  return <div ref={mapRef} className={`w-full h-full rounded-lg ${className}`} />
}
