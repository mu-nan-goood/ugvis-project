import { useState, useEffect, useRef, DragEvent } from 'react'
import { Download, Upload, Filter, X, AlertCircle, CheckCircle2, FileText } from 'lucide-react'
import type { SamplingPoint } from '../types'
import { ROAD_TYPE_LABELS } from '../types'
import { fetchPoints, importPoints, type ImportResult, type ImportError } from '../utils/api'

// ── 导入结果弹窗 ────────────────────────────────────────

interface ImportModalProps {
  onClose: () => void
  onSuccess: () => void
}

function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSet(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndSet(file)
  }

  function validateAndSet(file: File) {
    setError(null)
    setResult(null)
    if (!file.name.endsWith('.csv')) {
      setError('只支持 .csv 文件')
      return
    }
    if (file.size === 0) {
      setError('文件为空')
      return
    }
    setSelectedFile(file)
  }

  async function handleImport() {
    if (!selectedFile) return
    setUploading(true)
    setProgress(0)
    setError(null)
    setResult(null)

    try {
      const res = await importPoints(selectedFile, (pct) => setProgress(pct))
      setResult(res)
      if (res.success_count > 0) {
        onSuccess()
      }
    } catch (err: any) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail)
      } else {
        setError(err.message || '导入失败，请检查文件格式')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary-600" />
            导入采样点数据
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* 模板下载 */}
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>请上传 UTF-8 编码的 CSV 文件，</span>
            <button
              onClick={() => {
                // 生成模板 CSV
                const headers = [
                  'point_id', 'lat', 'lng',
                  'gvi_spring', 'gvi_summer', 'gvi_autumn', 'gvi_winter',
                  'ndvi_spring', 'ndvi_summer', 'ndvi_autumn', 'ndvi_winter',
                  'road_type',
                ]
                const sample = [
                  [100001, 32.0580, 118.7965, 0.35, 0.52, 0.41, 0.18, 0.42, 0.61, 0.49, 0.21, 'rc2'],
                  [100002, 32.0600, 118.7980, 0.31, 0.48, 0.38, 0.15, 0.38, 0.55, 0.44, 0.18, 'rc1'],
                ]
                const csv = [headers, ...sample].map((r) => r.join(',')).join('\n')
                const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'ugvis_import_template.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="text-primary-600 hover:underline font-medium"
            >
              下载模板文件
            </button>
          </div>

          {/* 上传区域 */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver
                ? 'border-primary-500 bg-primary-50'
                : selectedFile
                ? 'border-green-400 bg-green-50'
                : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            {selectedFile ? (
              <div className="space-y-1">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                <p className="font-medium text-gray-700">{selectedFile.name}</p>
                <p className="text-sm text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setResult(null) }}
                  className="text-sm text-red-500 hover:underline"
                >
                  重新选择
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="w-10 h-10 text-gray-400 mx-auto" />
                <p className="font-medium text-gray-600">
                  {dragOver ? '放开以上传' : '拖拽 CSV 文件到此处，或点击选择'}
                </p>
                <p className="text-sm text-gray-400">必需列：point_id, lat, lng</p>
              </div>
            )}
          </div>

          {/* 进度条 */}
          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>正在导入...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 结果 */}
          {result && (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                result.success_count > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                {result.success_count > 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                )}
                <div className="text-sm">
                  <span className="font-medium text-green-700">
                    成功导入 {result.success_count} 条
                  </span>
                  {result.error_count > 0 && (
                    <span className="text-red-600 ml-2">
                      ，失败 {result.error_count} 条
                    </span>
                  )}
                  <span className="text-gray-500 ml-2">
                    （共 {result.total_rows} 行）
                  </span>
                </div>
              </div>

              {/* 错误列表（仅显示前 20 条）*/}
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-red-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-red-600">行号</th>
                        <th className="text-left px-3 py-2 font-medium text-red-600">point_id</th>
                        <th className="text-left px-3 py-2 font-medium text-red-600">错误原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.slice(0, 20).map((err: ImportError, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5">{err.row || '-'}</td>
                          <td className="px-3 py-1.5">{err.point_id ?? '-'}</td>
                          <td className="px-3 py-1.5 text-red-700">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.errors.length > 20 && (
                    <p className="text-xs text-gray-500 px-3 py-2 border-t bg-gray-50">
                      仅显示前 20 条错误，共 {result.errors.length} 条
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            {result ? '关闭' : '取消'}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!selectedFile || uploading}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? '导入中...' : '开始导入'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 数据管理主页面 ──────────────────────────────────────

export default function DataManagement() {
  const [points, setPoints] = useState<SamplingPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [roadTypeFilter, setRoadTypeFilter] = useState<string>('all')
  const [showImportModal, setShowImportModal] = useState(false)

  const pageSize = 50

  useEffect(() => {
    loadPoints(0)
  }, [roadTypeFilter])

  async function loadPoints(skip: number) {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = { skip, limit: pageSize }
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
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowImportModal(true)}
        >
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
