import CountUp from './CountUp'

interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  change?: number
  icon: React.ReactNode
}

export default function StatCard({ title, value, unit, change, icon }: StatCardProps) {
  return (
    <div className="card hover-lift group cursor-default">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-surface-500 dark:text-surface-400 font-medium uppercase tracking-wide">
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight text-surface-900 dark:text-surface-50 mt-1">
            {typeof value === 'number' ? (
              <CountUp value={value} decimals={value % 1 !== 0 ? 1 : 0} />
            ) : (
              value
            )}
            {unit && (
              <span className="text-sm font-normal text-surface-400 dark:text-surface-500 ml-1">
                {unit}
              </span>
            )}
          </p>
          {change !== undefined && (
            <p
              className={`text-xs font-medium mt-1.5 ${
                change >= 0
                  ? 'text-success-600 dark:text-success-400'
                  : 'text-danger-600 dark:text-danger-400'
              }`}
            >
              {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
            </p>
          )}
        </div>
        <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl text-primary-600 dark:text-primary-400 transition-transform duration-200 group-hover:scale-105">
          {icon}
        </div>
      </div>
    </div>
  )
}
