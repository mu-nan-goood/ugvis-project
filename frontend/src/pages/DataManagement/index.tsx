import { useState, useEffect } from 'react'
import { Download, Upload, Filter, MapPin } from 'lucide-react'
import type { SamplingPoint, MapPoint, Season } from '../../types'
import { ROAD_TYPE_LABELS } from '../../types'
import { fetchPoints, fetchMapPoints } from '../../utils/api'
import ImportModal from './ImportModal'
import GVIMap from '../../components/GVIMap'

export default function DataManagement() {
  const [points, setPoints] = useState<SamplingPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roadTypeFilter, setRoadTypeFilter] = useState<string>('all')
  const [showImportModal, setShowImportModal] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([])
  const [highlightIds, setHighlightIds] = useState<number[]>([])
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>()
  const [season] = useState<Season>('spring')

  const pageSize = 50

  // Debounce search term (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    loadPoints(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadTypeFilter, debouncedSearch])

  // Load map points when map is shown
  useEffect(() => {
    if (!showMap) return
    fetchMapPoints({ season, limit: 20000 })
      .then((data) => setMapPoints(data.points || []))
      .catch(() => setMapPoints([]))
  }, [showMap, season])

  /** 点击表格行：在地图上高亮并居中 */
  function handleRowClick(row: SamplingPoint) {
    if (!showMap) {
      setShowMap(true)
      // 地图打开后再设置中心，延迟一帧等组件渲染
      setTimeout(() => {
        setHighlightIds([row.point_id])
        setMapCenter({ lat: row.lat, lng: row.lng })
      }, 300)
    } else {
      setHighlightIds([row.point_id])
      setMapCenter({ lat: row.lat, lng: row.lng })
    }
  }

  async function loadPoints(skip: number) {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = { skip, limit: pageSize }
      if (roadTypeFilter !== 'all') {
        params.road_type = roadTypeFilter
      }
      if (debouncedSearch) {
        params.search = debouncedSearch
      }
      const data = await fetchPoints(params)
      setPoints(data.items || [])
      setTotal(data.total || 0)
      setPage(skip / pageSize)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function handlePageChange(newPage: number) {
    loadPoints(newPage * pageSize)
  }

  const totalPages = Math.ceil(total / pageSize)

  function handleExportCSV() {
    // Server-side CSV export — exports ALL filtered data, not just current page
    const params = new URLSearchParams()
    if (roadTypeFilter !== 'all') params.set('road_type', roadTypeFilter)
    if (searchTerm) params.set('search', searchTerm)
    const qs = params.toString()
    const url = `/api/points/export/csv${qs ? '?' + qs : ''}`
    const a = document.createElement('a')
    a.href = url
    a.download = `ugvis_data_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  function handleExportGeoJSON() {
    // Server-side GeoJSON export (OGC RFC 7946)
    const params = new URLSearchParams()
    if (roadTypeFilter !== 'all') params.set('road_type', roadTypeFilter)
    const qs = params.toString()
    const url = `/api/points/export/geojson${qs ? '?' + qs : ''}`
    const a = document.createElement('a')
    a.href = url
    a.download = `ugvis_points_${new Date().toISOString().slice(0, 10)}.geojson`
    a.click()
  }

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
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowImportModal(true)}
        >
          <Upload className="w-4 h-4" />
          导入数据
        </button>
        <button
          className="btn-primary flex items-center gap-2"
          title="导出当前筛选的全部数据为CSV"
          onClick={handleExportCSV}
        >
          <Download className="w-4 h-4" />
          导出CSV
        </button>
        <button
          className="btn-secondary flex items-center gap-2"
          title="导出OGC GeoJSON格式"
          onClick={handleExportGeoJSON}
        >
          <Download className="w-4 h-4" />
          导出GeoJSON
        </button>
        <button
          className={`flex items-center gap-2 ${showMap ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowMap(!showMap)}
        >
          <MapPin className="w-4 h-4" />
          {showMap ? '隐藏地图' : '显示地图'}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="card bg-red-50 border-red-200">
          <p className="text-red-600">加载失败: {error}</p>
        </div>
      )}

      {/* Map + Table Layout */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className={`grid gap-6 ${showMap ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Map Panel */}
          {showMap && (
            <div className="card p-2" style={{ height: 500 }}>
              <GVIMap
                points={mapPoints}
                season={season}
                displayMode="heatmap"
                highlightIds={highlightIds}
                initialCenter={mapCenter}
                className="rounded-lg"
              />
            </div>
          )}
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
                  {points.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-8 text-gray-400">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    points.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleRowClick(row)}
                        title="点击在地图上定位"
                      >
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
                {debouncedSearch && (
                  <span className="ml-2 text-primary-600">
                    (搜索结果)
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
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false)
            loadPoints(0)
          }}
        />
      )}
    </div>
  )
}
