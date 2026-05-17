import { describe, it, expect } from 'vitest'
import type { ChatStreamEvent, ExpertPanelEvent } from './api'

describe('SSE Event Types', () => {
  describe('ChatStreamEvent', () => {
    it('should have valid chunk event structure', () => {
      const event: ChatStreamEvent = {
        type: 'chunk',
        content: 'Hello world',
      }
      expect(event.type).toBe('chunk')
      expect(event.content).toBe('Hello world')
    })

    it('should have valid error event structure', () => {
      const event: ChatStreamEvent = {
        type: 'error',
        content: 'Something went wrong',
      }
      expect(event.type).toBe('error')
    })

    it('should have valid tool_call_start event structure', () => {
      const event: ChatStreamEvent = {
        type: 'tool_call_start',
        name: 'get_weak_areas',
        arguments: { limit: 10 },
      }
      expect(event.type).toBe('tool_call_start')
      if (event.type === 'tool_call_start') {
        expect(event.name).toBe('get_weak_areas')
      }
    })

    it('should have valid tool_result event structure', () => {
      const event: ChatStreamEvent = {
        type: 'tool_result',
        name: 'get_weak_areas',
        data: { areas: [] },
        success: true,
      }
      expect(event.type).toBe('tool_result')
      if (event.type === 'tool_result') {
        expect(event.success).toBe(true)
      }
    })

    it('should support tool_result with error', () => {
      const event: ChatStreamEvent = {
        type: 'tool_result',
        name: 'get_weak_areas',
        success: false,
        error: 'Database error',
      }
      if (event.type === 'tool_result') {
        expect(event.error).toBe('Database error')
      }
    })
  })

  describe('ExpertPanelEvent', () => {
    it('should have valid panel_start event', () => {
      const event: ExpertPanelEvent = {
        type: 'panel_start',
      }
      expect(event.type).toBe('panel_start')
    })

    it('should have valid panel_start with experts list', () => {
      const event: ExpertPanelEvent = {
        type: 'panel_start',
        experts: [
          { emoji: '🏙️', name: '城市规划师' },
          { emoji: '🌿', name: '生态学家' },
        ],
      }
      if (event.type === 'panel_start' && event.experts) {
        expect(event.experts).toHaveLength(2)
      }
    })

    it('should have valid expert_done event', () => {
      const event: ExpertPanelEvent = {
        type: 'expert_done',
        expert_id: 'urban_planner',
        expert_name: '城市规划师',
        opinion: '建议增加绿化带',
      }
      if (event.type === 'expert_done') {
        expect(event.expert_id).toBe('urban_planner')
        expect(event.opinion).toBe('建议增加绿化带')
      }
    })

    it('should have valid moderator_start event', () => {
      const event: ExpertPanelEvent = {
        type: 'moderator_start',
      }
      expect(event.type).toBe('moderator_start')
    })

    it('should have valid moderator_chunk event', () => {
      const event: ExpertPanelEvent = {
        type: 'moderator_chunk',
        content: '综合各位专家意见',
      }
      if (event.type === 'moderator_chunk') {
        expect(event.content).toBe('综合各位专家意见')
      }
    })

    it('should have valid moderator_done event', () => {
      const event: ExpertPanelEvent = {
        type: 'moderator_done',
        content: '最终建议总结',
      }
      if (event.type === 'moderator_done') {
        expect(event.content).toBe('最终建议总结')
      }
    })

    it('should have valid panel_done event', () => {
      const event: ExpertPanelEvent = {
        type: 'panel_done',
      }
      expect(event.type).toBe('panel_done')
    })

    it('should have valid error event', () => {
      const event: ExpertPanelEvent = {
        type: 'error',
        content: 'API error',
      }
      expect(event.type).toBe('error')
    })
  })
})
