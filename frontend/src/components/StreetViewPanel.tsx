import { useMemo, useState } from 'react'
import type { MapPoint } from '../types'

// ─── 坐标转换（与 GVIMap 相同算法）─────────────────────
const PI = Math.PI
const A = 6378245.0
const EE = 0.006693421622965943

function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

function wgs84ToGcj02(lat: number, lng: number): [number, number] {
  if (outOfChina(lat, lng)) return [lat, lng]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return [lat + dLat, lng + dLng]
}

/** GCJ-02 → BD-09（百度坐标系） */
function gcj02ToBd09(lat: number, lng: number): [number, number] {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin((lat * PI * 3000.0) / 180.0)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos((lng * PI * 3000.0) / 180.0)
  return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065]
}

type Provider = 'amap' | 'baidu'

interface Props {
  point: MapPoint | null
  onClose: () => void
}

export default function StreetViewPanel({ point, onClose }: Props) {
  const [provider, setProvider] = useState<Provider>('amap')
  const [iframeError, setIframeError] = useState(false)

  const urls = useMemo(() => {
    if (!point) return { amap: '', baidu: '' }
    const [gLat, gLng] = wgs84ToGcj02(point.lat, point.lng)
    const [bLat, bLng] = gcj02ToBd09(gLat, gLng)
    return {
      amap: `https://uri.amap.com/streetview?streetview=1&lng=${gLng.toFixed(6)}&lat=${gLat.toFixed(6)}&heading=0&pitch=0&fov=90`,
      baidu: `https://map.baidu.com/?newmap=1&reqCode=1&subsubType=0&gallerytype=0&streetview=1&lng=${bLng.toFixed(6)}&lat=${bLat.toFixed(6)}&z=18`,
    }
  }, [point])

  if (!point) return null

  const gvi = point.gvi
  const gviColor =
    gvi != null
      ? gvi > 30
        ? 'text-green-600'
        : gvi > 15
          ? 'text-yellow-600'
          : 'text-red-600'
      : ''
  const gviLabel =
    gvi != null ? (gvi > 30 ? '良好' : gvi > 15 ? '中等' : '薄弱') : 'N/A'

  return (
    <div className="fixed inset-0 z-[2000] flex">
      {/* 遮罩 */}
      <div className="flex-1 bg-black/20" onClick={onClose} />

      {/* 侧面板 */}
      <div className="w-[460px] max-w-[92vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* ── 头部 ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              📸 采样点 {point.id} 街景
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* ── 点信息 ── */}
        <div className="px-5 py-3 border-b bg-gray-50/50">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-0.5">GVI</p>
              <p className={`font-semibold ${gviColor}`}>
                {gvi != null ? gvi.toFixed(2) + '%' : 'N/A'}
              </p>
              <p className="text-[10px] text-gray-400">{gviLabel}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-0.5">NDVI</p>
              <p className="font-semibold text-gray-700">
                {point.ndvi != null ? point.ndvi.toFixed(2) : 'N/A'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs mb-0.5">道路类型</p>
              <p className="font-semibold text-gray-700 text-xs">
                {point.road_type || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* ── 街景源切换 ── */}
        <div className="flex border-b">
          {(
            [
              { key: 'amap', label: '📍 高德街景', color: 'blue' },
              { key: 'baidu', label: '🔍 百度街景', color: 'red' },
            ] as const
          ).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => {
                setProvider(key)
                setIframeError(false)
              }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                provider === key
                  ? color === 'blue'
                    ? 'text-blue-700 border-blue-600 bg-blue-50/50'
                    : 'text-red-700 border-red-600 bg-red-50/50'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── 街景内容 ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {!iframeError ? (
            <iframe
              key={provider}
              src={urls[provider]}
              className="flex-1 w-full border-0"
              title={`${provider === 'amap' ? '高德' : '百度'}街景`}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              onError={() => setIframeError(true)}
              onLoad={(e) => {
                // 检测 iframe 是否加载失败（跨域限制等）
                try {
                  const doc = (e.target as HTMLIFrameElement).contentDocument
                  if (!doc || !doc.body?.innerHTML) {
                    setIframeError(true)
                  }
                } catch {
                  // 跨域无法读取 contentDocument → iframe 可能在正常加载
                  // 不标记为 error，给用户手动切换到新标签页的选项
                }
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 px-6">
              <div className="text-5xl mb-4">🗺️</div>
              <p className="text-sm mb-2">街景无法在此嵌入显示</p>
              <p className="text-xs text-gray-400">
                请点击下方按钮在新标签页中查看
              </p>
            </div>
          )}
        </div>

        {/* ── 底部操作栏 ── */}
        <div className="px-5 py-3 border-t bg-gray-50/50 flex gap-3">
          <a
            href={urls[provider]}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-1 text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
              provider === 'amap'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            在新标签页打开街景 →
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
