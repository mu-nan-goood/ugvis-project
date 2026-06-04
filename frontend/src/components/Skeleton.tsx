import { motion } from 'framer-motion'

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-surface-200 dark:bg-surface-700 ${className}`}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent"
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="card">
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="flex items-end gap-2 h-64">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-5 w-32 mb-2" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonMap() {
  return (
    <div className="card">
      <Skeleton className="h-5 w-40 mb-3" />
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  )
}
