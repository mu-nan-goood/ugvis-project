import { useState, useEffect } from 'react'
import { Download, Upload, Filter } from 'lucide-react'
import type { SamplingPoint } from '../types'
import { ROAD_TYPE_LABELS } from '../types'
import { fetchPoints } from '../utils/api'

export default function DataManagement() {
  const [points, setPoints] = useState<SamplingPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [roadTypeFilter, setRoadTypeFilter] = useState<string>('all')

  const pageSize = 50

  useEffect(() => {
    loadPoints(0)
  }, [roadTypeFilter])

  async function loadPoints(skip: number) {
    setLoading(true)
    setError(null)
    try {
      const params: any = { skip, limit: pageSize }
      if (roadTypeFilter !== 'all') {
        params.road_type = roadTypeFilter
      }
      const data = await fetchPoints(params)
      setPoints(data.items || [])
      setTotal(data.total || 0)
      setPage(skip / pageSize)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handlePageChange(newPage: number) {
    loadPoints(newPage * pageSize)
  }

  const totalPages = Math.ceil(total / pageSize)

  // 过滤后的数据（支持搜索 point_id 或道路类型）
  const filteredPoints = points.filter((d) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      d.point_id?.toString().toLowerCase().includes(term) ||
      d.road_type?.toLowerCase().includes(term) ||
      ROAD_TYPE_LABELS[d.road_type || '']?.toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">数据管理</h2>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="搜索采样点ID或道路类型..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={roadTypeFilter}
          onChange={(e) => {
            setRoadTypeFilter(e.target.value)
            setSearchTerm('')
          }}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="all">全部道路类型</option>
          <option value="rc1">快速路</option>
          <option value="rc2">主干道</option>
          <option value="rc3">次干道</option>
          <option value="rc4">支路</option>
        </select>
        <button className="btn-secondary flex items-center gap-2" title="高级筛选功能开发中">
          <Filter className="w-4 h-4" />
          高级筛选
        </button>
        <button className="btn-primary flex items-center gap-2" title="数据导入功能开发中">
          <Upload className="w-4 h-4" />
          导入数据
        </button>
        <button
          className="btn-primary flex items-center gap-2"
          title="导出当前筛选结果为CSV"
          onClick={() => {
            // 生成 CSV：使用前端已有数据（已分页，如需全量需后端支持）
            const headers = [
              'point_id', 'lat', 'lng',
              'gvi_spring', 'gvi_summer', 'gvi_autumn', 'gvi_winter',
              'ndvi_spring', 'ndvi_summer', 'ndvi_autumn', 'ndvi_winter',
              'road_type'
            ]
            const rows = filteredPoints.map((p) => [
              p.point_id, p.lat, p.lng,
              p.gvi_spring, p.gvi_summer, p.gvi_autumn, p.gvi_winter,
              p.ndvi_spring ?? '', p.ndvi_summer ?? '', p.ndvi_autumn ?? '', p.ndvi_winter ?? '',
              p.road_type
            ])
            const csv = [headers, ...rows]
              .map((r) => r.join(','))
              .join('\n')
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `ugvis_data_${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          <Download className="w-4 h-4" />
          导出CSV
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="card bg-red-50 border-red-200">
          <p className="text-red-600">加载失败: {error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          {/* Data Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left py-3 px-4">ID</th>
                    <th className="text-right py-3 px-4">纬度</th>
                    <th className="text-right py-3 px-4">经度</th>
                    <th className="text-right py-3 px-4">春季GVI</th>
                    <th className="text-right py-3 px-4">夏季GVI</th>
                    <th className="text-right py-3 px-4">秋季GVI</th>
                    <th className="text-right py-3 px-4">冬季GVI</th>
                    <th className="text-right py-3 px-4">春季NDVI</th>
                    <th className="text-right py-3 px-4">夏季NDVI</th>
                    <th className="text-right py-3 px-4">秋季NDVI</th>
                    <th className="text-right py-3 px-4">冬季NDVI</th>
                    <th className="text-center py-3 px-4">道路类型</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPoints.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-8 text-gray-400">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    filteredPoints.map((row) => (
                      <tr key={row.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">{row.point_id}</td>
                        <td className="text-right py-3 px-4">{row.lat?.toFixed(6) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.lng?.toFixed(6) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.gvi_spring?.toFixed(2) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.gvi_summer?.toFixed(2) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.gvi_autumn?.toFixed(2) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.gvi_winter?.toFixed(2) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.ndvi_spring?.toFixed(4) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.ndvi_summer?.toFixed(4) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.ndvi_autumn?.toFixed(4) ?? '—'}</td>
                        <td className="text-right py-3 px-4">{row.ndvi_winter?.toFixed(4) ?? '—'}</td>
                        <td className="text-center py-3 px-4">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                            {ROAD_TYPE_LABELS[row.road_type || ''] || row.road_type || '—'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t">
              <span className="text-sm text-gray-500">
                第 {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} 条 / 共 {total.toLocaleString()} 条
                {filteredPoints.length !== points.length && (
                  <span className="ml-2 text-primary-600">
                    (已筛选 {filteredPoints.length} 条)
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(0)}
                  disabled={page === 0}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  首页
                </button>
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="px-3 py-1">
                  第 {page + 1} / {totalPages} 页
                </span>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  下一页
                </button>
                <button
                  onClick={() => handlePageChange(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  末页
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
