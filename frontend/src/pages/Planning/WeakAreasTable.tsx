import type { WeakArea } from './types'
import { ROAD_TYPE_LABELS, PRIORITY_LABELS } from './types'

interface WeakAreasTableProps {
  areas: WeakArea[]
  selectedPointId?: number
  onOpenInMap: (area: WeakArea) => void
  onAskAI: (area: WeakArea) => void
}

export default function WeakAreasTable({
  areas,
  selectedPointId,
  onOpenInMap,
  onAskAI,
}: WeakAreasTableProps) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white shadow-sm">
            <tr className="border-b">
              <th className="text-left py-3 px-4">ID</th>
              <th className="text-left py-3 px-4">坐标</th>
              <th className="text-right py-3 px-4">冬GVI</th>
              <th className="text-right py-3 px-4">春GVI</th>
              <th className="text-right py-3 px-4">夏GVI</th>
              <th className="text-right py-3 px-4">秋GVI</th>
              <th className="text-left py-3 px-4">道路类型</th>
              <th className="text-center py-3 px-4">优先级</th>
              <th className="text-left py-3 px-4">改造建议</th>
              <th className="text-center py-3 px-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => {
              const p = PRIORITY_LABELS[area.priority] || PRIORITY_LABELS.low
              const isSelected = selectedPointId === area.point_id
              return (
                <tr
                  key={area.id}
                  className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <td className="py-2 px-4">{area.point_id}</td>
                  <td className="py-2 px-4 text-xs text-gray-500">
                    {area.lat.toFixed(4)},{area.lng.toFixed(4)}
                  </td>
                  <td className="text-right py-2 px-4">{area.gvi_winter?.toFixed(1) ?? '-'}</td>
                  <td className="text-right py-2 px-4">{area.gvi_spring?.toFixed(1) ?? '-'}</td>
                  <td className="text-right py-2 px-4">{area.gvi_summer?.toFixed(1) ?? '-'}</td>
                  <td className="text-right py-2 px-4">{area.gvi_autumn?.toFixed(1) ?? '-'}</td>
                  <td className="py-2 px-4">
                    {ROAD_TYPE_LABELS[area.road_type || ''] || area.road_type || '-'}
                  </td>
                  <td className="py-2 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${p.bg} ${p.color}`}
                    >
                      {p.label}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-xs max-w-xs truncate" title={area.suggestion}>
                    {area.suggestion}
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-1 justify-center">
                      <button
                        onClick={() => onOpenInMap(area)}
                        title="在地图上查看"
                        className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                      >
                        📍查看
                      </button>
                      <button
                        onClick={() => onAskAI(area)}
                        title="询问AI"
                        className="px-2 py-1 text-xs bg-green-50 hover:bg-green-100 text-green-600 rounded transition-colors"
                      >
                        🤖询问
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
