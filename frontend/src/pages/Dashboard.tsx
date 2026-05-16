import { useEffect, useState } from 'react'
import { TreePine, MapPin, TrendingUp, Activity } from 'lucide-react'
import StatCard from '../components/StatCard'
import GVIChart from '../components/GVIChart'
import type { EChartsOption } from '../components/GVIChart'
import type { StatsResponse } from '../types'
import { fetchStats } from '../utils/api'

export default function Dashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
      .then((data) => {
        setStats(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="card bg-red-50 border-red-200">
        <p className="text-red-600">加载失败: {error || '未知错误'}</p>
        <p className="text-sm text-gray-500 mt-2">后端API: http://localhost:8000/api/stats</p>
      </div>
    )
  }

  // 计算平均GVI（四季加权平均）
  const totalSamples = stats.seasonal.reduce((s, x) => s + x.sample_count, 0)
  const avgGVI = totalSamples > 0
    ? stats.seasonal.reduce((s, x) => s + x.avg_gvi * x.sample_count, 0) / totalSamples
    : 0

  // 四季季节图表数据
  const seasonalOption: EChartsOption = {
    title: { text: '四季平均GVI对比', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: stats.seasonal.map((s) => {
        const map: Record<string, string> = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }
        return map[s.season] || s.season
      }),
      name: '季节',
    },
    yAxis: { type: 'value', name: '平均GVI (%)' },
    series: [
      {
        name: '平均GVI',
        type: 'bar',
        data: stats.seasonal.map((s) => s.avg_gvi),
        itemStyle: { color: '#22c55e' },
        barWidth: '40%',
      },
      {
        name: '平均NDVI',
        type: 'bar',
        data: stats.seasonal.map((s) => s.avg_ndvi),
        itemStyle: { color: '#3b82f6' },
        barWidth: '40%',
      },
    ],
  }

  // 道路类型雷达图
  const roadTypeLabels: Record<string, string> = { rc1: '快速路', rc2: '主干道', rc3: '次干道', rc4: '支路' }
  const roadTypeKeys = Object.keys(stats.road_types)
  const maxCount = Math.max(...Object.values(stats.road_types))

  const roadTypeOption: EChartsOption = {
    title: { text: '道路类型采样点分布', left: 'center' },
    tooltip: {},
    xAxis: {
      type: 'category',
      data: roadTypeKeys.map((k) => roadTypeLabels[k] || k),
      name: '道路类型',
    },
    yAxis: { type: 'value', name: '采样点数量', max: Math.ceil(maxCount / 10000) * 10000 },
    series: [
      {
        name: '采样点数量',
        type: 'bar',
        data: roadTypeKeys.map((k) => stats.road_types[k]),
        itemStyle: {
          color: (params: any) => ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'][params.dataIndex],
        },
      },
    ],
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">系统总览</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="总采样点数"
          value={stats.total_points.toLocaleString()}
          icon={<MapPin className="w-6 h-6" />}
        />
        <StatCard
          title="平均GVI"
          value={avgGVI.toFixed(1)}
          unit="%"
          icon={<TreePine className="w-6 h-6" />}
        />
        <StatCard
          title="道路段数量"
          value={stats.total_roads.toLocaleString()}
          icon={<Activity className="w-6 h-6" />}
        />
        <StatCard
          title="高GVI样本"
          value={stats.seasonal.find((s) => s.season === 'summer')?.avg_gvi.toFixed(1) || '—'}
          unit="%"
          icon={<TrendingUp className="w-6 h-6" />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <GVIChart option={seasonalOption} className="h-80" />
        </div>
        <div className="card">
          <GVIChart option={roadTypeOption} className="h-80" />
        </div>
      </div>

      {/* Seasonal Summary Table */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">季节数据统计</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">季节</th>
                <th className="text-right py-2">平均GVI</th>
                <th className="text-right py-2">平均NDVI</th>
                <th className="text-right py-2">有效样本</th>
              </tr>
            </thead>
            <tbody>
              {stats.seasonal.map((s) => {
                const labels: Record<string, string> = { spring: '🌸 春季', summer: '☀️ 夏季', autumn: '🍂 秋季', winter: '❄️ 冬季' }
                return (
                  <tr key={s.season} className="border-b">
                    <td className="py-2">{labels[s.season] || s.season}</td>
                    <td className="text-right font-medium">{s.avg_gvi.toFixed(2)}</td>
                    <td className="text-right">{s.avg_ndvi.toFixed(2)}</td>
                    <td className="text-right">{s.sample_count.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
