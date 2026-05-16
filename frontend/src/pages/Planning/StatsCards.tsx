import type { PlanningStats } from './types'

interface StatsCardsProps {
  stats: PlanningStats
}

export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="card border-l-4 border-red-500">
        <h3 className="text-sm text-gray-500">高优先级区域</h3>
        <p className="text-2xl font-bold text-red-600">
          {stats.high_priority.toLocaleString()}
        </p>
        <p className="text-xs text-gray-400">冬季GVI &lt; 5%</p>
      </div>
      <div className="card border-l-4 border-yellow-500">
        <h3 className="text-sm text-gray-500">中优先级区域</h3>
        <p className="text-2xl font-bold text-yellow-600">
          {stats.medium_priority.toLocaleString()}
        </p>
        <p className="text-xs text-gray-400">冬季GVI 5-8%</p>
      </div>
      <div className="card border-l-4 border-green-500">
        <h3 className="text-sm text-gray-500">低优先级区域</h3>
        <p className="text-2xl font-bold text-green-600">
          {stats.low_priority.toLocaleString()}
        </p>
        <p className="text-xs text-gray-400">冬季GVI 8-10%</p>
      </div>
      <div className="card border-l-4 border-blue-500">
        <h3 className="text-sm text-gray-500">预估需补植树苗</h3>
        <p className="text-2xl font-bold text-blue-600">
          {stats.estimated_trees.toLocaleString()}
        </p>
        <p className="text-xs text-gray-400">按高3棵/中2棵估算</p>
      </div>
    </div>
  )
}
