import type * as L from 'leaflet'

type HeatPoint = [number, number, number?]

interface HeatLayerOptions {
  minOpacity?: number
  maxZoom?: number
  max?: number
  radius?: number
  blur?: number
  gradient?: Record<number, string>
}

declare module 'leaflet' {
  function heatLayer(
    latlngs: HeatPoint[],
    options?: HeatLayerOptions,
  ): L.Layer
}
