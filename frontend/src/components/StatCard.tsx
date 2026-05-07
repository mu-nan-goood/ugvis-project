interface StatCardProps {
  title: string
  value: string | number
  unit?: string
  change?: number
  icon: React.ReactNode
}

export default function StatCard({ title, value, unit, change, icon }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold mt-1">
            {value}
            {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
          </p>
          {change !== undefined && (
            <p className={`text-sm mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            </p>
          )}
        </div>
        <div className="p-3 bg-primary-50 rounded-lg text-primary-600">{icon}</div>
      </div>
    </div>
  )
}
