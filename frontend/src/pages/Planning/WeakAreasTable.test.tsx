import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeakAreasTable from './WeakAreasTable'
import type { WeakArea } from './types'

const mockAreas: WeakArea[] = [
  {
    id: 1,
    point_id: 100,
    lat: 32.0601,
    lng: 118.7902,
    gvi_winter: 3.2,
    gvi_spring: 12.5,
    gvi_summer: 22.1,
    gvi_autumn: 15.8,
    road_type: 'rc3',
    priority: 'high',
    suggestion: '增加行道树与灌木层',
  },
  {
    id: 2,
    point_id: 200,
    lat: 32.0650,
    lng: 118.7850,
    gvi_winter: 7.5,
    gvi_spring: 15.0,
    gvi_summer: 24.3,
    gvi_autumn: 18.0,
    road_type: 'rc2',
    priority: 'medium',
    suggestion: '补植落叶乔木',
  },
]

describe('WeakAreasTable', () => {
  it('should render table headers', () => {
    render(
      <WeakAreasTable
        areas={mockAreas}
        onOpenInMap={vi.fn()}
        onAskAI={vi.fn()}
      />
    )
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('坐标')).toBeInTheDocument()
    expect(screen.getByText('冬GVI')).toBeInTheDocument()
    expect(screen.getByText('道路类型')).toBeInTheDocument()
    expect(screen.getByText('优先级')).toBeInTheDocument()
    expect(screen.getByText('改造建议')).toBeInTheDocument()
    expect(screen.getByText('操作')).toBeInTheDocument()
  })

  it('should render all area rows', () => {
    render(
      <WeakAreasTable
        areas={mockAreas}
        onOpenInMap={vi.fn()}
        onAskAI={vi.fn()}
      />
    )
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('should display road type labels in Chinese', () => {
    render(
      <WeakAreasTable
        areas={mockAreas}
        onOpenInMap={vi.fn()}
        onAskAI={vi.fn()}
      />
    )
    expect(screen.getByText('次干路')).toBeInTheDocument()
    expect(screen.getByText('主干路')).toBeInTheDocument()
  })

  it('should display priority labels', () => {
    render(
      <WeakAreasTable
        areas={mockAreas}
        onOpenInMap={vi.fn()}
        onAskAI={vi.fn()}
      />
    )
    expect(screen.getByText('高')).toBeInTheDocument()
    expect(screen.getByText('中')).toBeInTheDocument()
  })

  it('should call onOpenInMap when view button is clicked', async () => {
    const onOpenInMap = vi.fn()
    render(
      <WeakAreasTable
        areas={mockAreas}
        onOpenInMap={onOpenInMap}
        onAskAI={vi.fn()}
      />
    )
    const viewButtons = screen.getAllByTitle('在地图上查看')
    await userEvent.click(viewButtons[0])
    expect(onOpenInMap).toHaveBeenCalledWith(mockAreas[0])
  })

  it('should call onAskAI when ask button is clicked', async () => {
    const onAskAI = vi.fn()
    render(
      <WeakAreasTable
        areas={mockAreas}
        onAskAI={onAskAI}
        onOpenInMap={vi.fn()}
      />
    )
    const askButtons = screen.getAllByTitle('询问AI')
    await userEvent.click(askButtons[1])
    expect(onAskAI).toHaveBeenCalledWith(mockAreas[1])
  })

  it('should highlight selected row', () => {
    const { container } = render(
      <WeakAreasTable
        areas={mockAreas}
        selectedPointId={100}
        onOpenInMap={vi.fn()}
        onAskAI={vi.fn()}
      />
    )
    const selectedRow = container.querySelector('.bg-blue-50')
    expect(selectedRow).toBeInTheDocument()
  })

  it('should handle null seasonal GVI with dash', () => {
    const areaWithNulls: WeakArea[] = [
      {
        id: 3,
        point_id: 300,
        lat: 32.0,
        lng: 118.8,
        gvi_winter: null,
        gvi_spring: null,
        gvi_summer: null,
        gvi_autumn: null,
        road_type: null,
        priority: 'low',
        suggestion: '无需改造',
      },
    ]
    render(
      <WeakAreasTable
        areas={areaWithNulls}
        onOpenInMap={vi.fn()}
        onAskAI={vi.fn()}
      />
    )
    // Null GVI values should render as '-'
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(4) // 4 GVI columns + road_type
  })

  it('should render empty table gracefully', () => {
    render(
      <WeakAreasTable
        areas={[]}
        onOpenInMap={vi.fn()}
        onAskAI={vi.fn()}
      />
    )
    // Table headers should still render
    expect(screen.getByText('ID')).toBeInTheDocument()
    // No row content
    expect(screen.queryByText('📍查看')).not.toBeInTheDocument()
  })
})
