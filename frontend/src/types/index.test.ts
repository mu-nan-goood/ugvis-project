import { describe, it, expect } from 'vitest'
import {
  SEASON_LABELS,
  ROAD_TYPE_LABELS,
  SEASON_GVI_FIELD,
  type WeakArea,
  type Season,
  type SamplingPoint,
} from './index'

describe('Global types and constants', () => {
  describe('SEASON_LABELS', () => {
    it('should map all 4 seasons to Chinese labels', () => {
      const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter']
      for (const s of seasons) {
        expect(SEASON_LABELS[s]).toBeDefined()
        expect(typeof SEASON_LABELS[s]).toBe('string')
      }
    })
  })

  describe('ROAD_TYPE_LABELS (global)', () => {
    it('should have 4 road type entries', () => {
      expect(Object.keys(ROAD_TYPE_LABELS)).toHaveLength(4)
    })
  })

  describe('SEASON_GVI_FIELD', () => {
    it('should map each season to the correct GVI field', () => {
      expect(SEASON_GVI_FIELD.spring).toBe('gvi_spring')
      expect(SEASON_GVI_FIELD.summer).toBe('gvi_summer')
      expect(SEASON_GVI_FIELD.autumn).toBe('gvi_autumn')
      expect(SEASON_GVI_FIELD.winter).toBe('gvi_winter')
    })
  })

  describe('WeakArea (global)', () => {
    it('should be importable from global types', () => {
      const area: WeakArea = {
        id: 1,
        point_id: 100,
        lat: 32.0,
        lng: 118.8,
        gvi_winter: 10,
        gvi_spring: 15,
        gvi_summer: 20,
        gvi_autumn: 18,
        road_type: 'rc2',
        priority: 'medium',
        suggestion: '补植灌木',
      }
      expect(area.road_type).toBe('rc2')
    })
  })

  describe('SamplingPoint', () => {
    it('should accept a valid SamplingPoint with seasonal data', () => {
      const point: SamplingPoint = {
        id: 1,
        point_id: 42,
        lat: 32.06,
        lng: 118.79,
        gvi_spring: 15.2,
        gvi_summer: 22.8,
        gvi_autumn: 18.5,
        gvi_winter: 8.1,
        ndvi_spring: 0.35,
        ndvi_summer: 0.52,
        ndvi_autumn: 0.41,
        ndvi_winter: 0.18,
        road_type: 'rc3',
        created_at: '2025-01-01T00:00:00Z',
      }
      expect(point.point_id).toBe(42)
      expect(point.ndvi_summer).toBeCloseTo(0.52)
    })
  })
})
