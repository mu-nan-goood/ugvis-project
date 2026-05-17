import { describe, it, expect } from 'vitest'
import {
  ROAD_TYPE_LABELS,
  PRIORITY_LABELS,
  TOOL_DISPLAY_NAMES,
  PROVIDER_OPTIONS,
  DEFAULT_MODELS,
} from './types'
import type { WeakArea } from './types'

describe('Planning types and constants', () => {
  describe('ROAD_TYPE_LABELS', () => {
    it('should have labels for all 4 road types', () => {
      expect(Object.keys(ROAD_TYPE_LABELS)).toHaveLength(4)
      expect(ROAD_TYPE_LABELS.rc1).toBe('快速路')
      expect(ROAD_TYPE_LABELS.rc2).toBe('主干路')
      expect(ROAD_TYPE_LABELS.rc3).toBe('次干路')
      expect(ROAD_TYPE_LABELS.rc4).toBe('支路')
    })
  })

  describe('PRIORITY_LABELS', () => {
    it('should have labels for all 3 priority levels', () => {
      expect(Object.keys(PRIORITY_LABELS)).toHaveLength(3)
      for (const key of ['high', 'medium', 'low']) {
        expect(PRIORITY_LABELS[key]).toHaveProperty('label')
        expect(PRIORITY_LABELS[key]).toHaveProperty('color')
        expect(PRIORITY_LABELS[key]).toHaveProperty('bg')
      }
    })
  })

  describe('TOOL_DISPLAY_NAMES', () => {
    it('should map all 5 tool names to Chinese display names', () => {
      expect(Object.keys(TOOL_DISPLAY_NAMES)).toHaveLength(5)
      expect(TOOL_DISPLAY_NAMES.get_weak_areas).toBe('查询薄弱区域')
      expect(TOOL_DISPLAY_NAMES.get_statistics).toBe('获取统计数据')
    })
  })

  describe('PROVIDER_OPTIONS', () => {
    it('should have 5 provider options with value and label', () => {
      expect(PROVIDER_OPTIONS).toHaveLength(5)
      for (const opt of PROVIDER_OPTIONS) {
        expect(opt).toHaveProperty('value')
        expect(opt).toHaveProperty('label')
      }
    })
  })

  describe('DEFAULT_MODELS', () => {
    it('should map every provider to a default model', () => {
      for (const { value } of PROVIDER_OPTIONS) {
        expect(DEFAULT_MODELS[value]).toBeDefined()
        expect(typeof DEFAULT_MODELS[value]).toBe('string')
      }
    })
  })

  describe('WeakArea type', () => {
    it('should accept a valid WeakArea object', () => {
      const area: WeakArea = {
        id: 1,
        point_id: 100,
        lat: 32.06,
        lng: 118.79,
        gvi_winter: 12.5,
        gvi_spring: 18.3,
        gvi_summer: 25.1,
        gvi_autumn: 20.0,
        road_type: 'rc3',
        priority: 'high',
        suggestion: '增加行道树',
      }
      expect(area.id).toBe(1)
      expect(area.priority).toBe('high')
    })

    it('should allow null seasonal GVI values', () => {
      const area: WeakArea = {
        id: 2,
        point_id: 200,
        lat: 32.0,
        lng: 118.8,
        gvi_winter: null,
        gvi_spring: null,
        gvi_summer: null,
        gvi_autumn: null,
        road_type: null,
        priority: 'low',
        suggestion: '无需改造',
      }
      expect(area.gvi_winter).toBeNull()
    })
  })
})
