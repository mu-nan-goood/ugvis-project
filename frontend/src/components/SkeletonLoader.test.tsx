import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Skeleton, { SkeletonCard, SkeletonTable, SkeletonStats } from './SkeletonLoader'

describe('SkeletonLoader', () => {
  describe('Skeleton', () => {
    it('should render with default classes', () => {
      const { container } = render(<Skeleton />)
      const el = container.firstElementChild as HTMLElement
      expect(el.className).toContain('bg-gray-200')
      expect(el.className).toContain('animate-pulse')
    })

    it('should accept custom className', () => {
      const { container } = render(<Skeleton className="h-8 w-full" />)
      const el = container.firstElementChild as HTMLElement
      expect(el.className).toContain('h-8')
      expect(el.className).toContain('w-full')
    })
  })

  describe('SkeletonCard', () => {
    it('should render default 3 rows', () => {
      const { container } = render(<SkeletonCard />)
      const skeletons = container.querySelectorAll('.animate-pulse > .bg-gray-200')
      expect(skeletons.length).toBe(3)
    })

    it('should render custom number of rows', () => {
      const { container } = render(<SkeletonCard rows={5} />)
      const skeletons = container.querySelectorAll('.animate-pulse > .bg-gray-200')
      expect(skeletons.length).toBe(5)
    })
  })

  describe('SkeletonTable', () => {
    it('should render header + default 5 rows × 6 cols', () => {
      const { container } = render(<SkeletonTable />)
      const rows = container.querySelectorAll('.flex.gap-4')
      // 1 header + 5 body rows
      expect(rows.length).toBe(6)
    })

    it('should render custom rows and cols', () => {
      const { container } = render(<SkeletonTable rows={3} cols={4} />)
      const rows = container.querySelectorAll('.flex.gap-4')
      expect(rows.length).toBe(4) // 1 header + 3 body
      // Each row should have 4 skeleton items
      const headerRow = rows[0]
      const items = headerRow.querySelectorAll('.bg-gray-200')
      expect(items.length).toBe(4)
    })
  })

  describe('SkeletonStats', () => {
    it('should render 4 stat cards', () => {
      const { container } = render(<SkeletonStats />)
      const cards = container.querySelectorAll('.card.animate-pulse')
      expect(cards.length).toBe(4)
    })
  })
})
