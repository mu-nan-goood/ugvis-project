import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapPoint, Season } from '../types'

interface GVIMapProps {
  points: MapPoint[]
  season: Season
  className?: string
}

export default function GVIMap({ points, season, className = '' }: GVIMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (mapRef.current && !leafletMap.current) {
      leafletMap.current = L.map(mapRef.current).setView([32.05, 118.78], 11)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(leafletMap.current)
      markersLayer.current = L.layerGroup().addTo(leafletMap.current)
    }
  }, [])

  useEffect(() => {
    if (markersLayer.current && leafletMap.current) {
      markersLayer.current.clearLayers()

      points.forEach((point) => {
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

        markersLayer.current?.addLayer(circle)
      })

      // Auto-fit bounds if points exist
      if (points.length > 0) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
        leafletMap.current.fitBounds(bounds, { padding: [20, 20] })
      }
    }
  }, [points, season])

  return <div ref={mapRef} className={`w-full h-full rounded-lg ${className}`} />
}
