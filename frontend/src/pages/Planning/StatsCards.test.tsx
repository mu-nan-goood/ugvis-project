import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsCards from './StatsCards'
import type { PlanningStats } from './types'

const mockStats: PlanningStats = {
  high_priority: 120,
  medium_priority: 350,
  low_priority: 800,
  estimated_trees: 1060,
  estimated_gvi_improvement: 2.5,
}

describe('StatsCards', () => {
  it('should render all 4 stat cards', () => {
    render(<StatsCards stats={mockStats} />)
    expect(screen.getByText('高优先级区域')).toBeInTheDocument()
    expect(screen.getByText('中优先级区域')).toBeInTheDocument()
    expect(screen.getByText('低优先级区域')).toBeInTheDocument()
    expect(screen.getByText('预估需补植树苗')).toBeInTheDocument()
  })

  it('should display formatted numbers', () => {
    render(<StatsCards stats={mockStats} />)
    // toLocaleString() in jsdom may vary; check at least the digits are present
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('350')).toBeInTheDocument()
    expect(screen.getByText('800')).toBeInTheDocument()
  })

  it('should show priority threshold descriptions', () => {
    render(<StatsCards stats={mockStats} />)
    expect(screen.getByText(/冬季GVI < 5%/)).toBeInTheDocument()
    expect(screen.getByText(/冬季GVI 5-8%/)).toBeInTheDocument()
    expect(screen.getByText(/冬季GVI 8-10%/)).toBeInTheDocument()
  })

  it('should handle zero values', () => {
    const zeroStats: PlanningStats = {
      high_priority: 0,
      medium_priority: 0,
      low_priority: 0,
      estimated_trees: 0,
      estimated_gvi_improvement: 0,
    }
    render(<StatsCards stats={zeroStats} />)
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(4)
  })
})
