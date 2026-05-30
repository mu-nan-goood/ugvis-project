import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapPoint } from '../types'
import { wgs84ToGcj02, gcj02ToBd09 } from '../utils/coordTransform'

// ─── API Keys (from env or fallback) ────────────────────────────────────
// 高德 JS API Key（Web端），申请地址：https://console.amap.com/dev/key/app
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || ''
// 百度地图 JS API AK，申请地址：https://lbsyun.baidu.com/apiconsole/key
const BAIDU_AK = import.meta.env.VITE_BAIDU_AK || ''

type Provider = 'amap' | 'baidu'

interface Props {
  point: MapPoint | null
  onClose: () => void
}

// ─── Dynamic script loader ──────────────────────────────────────────────
const loadedScripts = new Set<string>()
const scriptPromises = new Map<string, Promise<void>>()

function loadScript(id: string, src: string): Promise<void> {
  if (loadedScripts.has(id)) return Promise.resolve()
  if (scriptPromises.has(id)) return scriptPromises.get(id)!

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.onload = () => { loadedScripts.add(id); resolve() }
    script.onerror = () => reject(new Error(`Failed to load ${id}`))
    document.head.appendChild(script)
  })
  scriptPromises.set(id, promise)
  return promise
}

// ─── AMap Panorama ──────────────────────────────────────────────────────
declare const AMap: {
  Panorama: new (
    container: string | HTMLElement,
    opts?: { position?: [number, number]; fov?: number; heading?: number; pitch?: number }
  ) => { destroy: () => void }
}

async function loadAmapApi(): Promise<void> {
  if ((window as unknown as Record<string, unknown>)['AMap']) return
  if (!AMAP_KEY) throw new Error('VITE_AMAP_KEY not configured')
  await loadScript(
    'amap-js-api',
    `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Panorama`,
  )
}

// ─── Baidu Panorama ────────────────────────────────────────────────────
declare const BMap: {
  Point: new (lng: number, lat: number) => unknown
  Panorama: new (
    container: string | HTMLElement,
    opts?: { navigationControl?: boolean; linksControl?: boolean; addressControl?: boolean }
  ) => { setPosition: (pos: unknown) => void; enableScrollWheelZoom: () => void; destroy: () => void }
}

async function loadBaiduApi(): Promise<void> {
  if ((window as unknown as Record<string, unknown>)['BMap']) return
  if (!BAIDU_AK) throw new Error('VITE_BAIDU_AK not configured')
  // Baidu JS API uses callback pattern
  await new Promise<void>((resolve, reject) => {
    const cbName = 'baiduMapInit_' + Date.now()
    ;(window as unknown as Record<string, unknown>)[cbName] = () => resolve()
    const script = document.createElement('script')
    script.src = `https://api.map.baidu.com/api?v=3.0&ak=${BAIDU_AK}&callback=${cbName}`
    script.async = true
    script.onerror = () => reject(new Error('Failed to load Baidu JS API'))
    document.head.appendChild(script)
  })
  // Load panorama coverage module (required by BMap.Panorama)
  await loadScript(
    'baidu-panorama-js',
    'https://api.map.baidu.com/library/PanoramaCoverage/1.2/src/PanoramaCoverage_min.js',
  )
}

export default function StreetViewPanel({ point, onClose }: Props) {
  const [provider, setProvider] = useState<Provider>('amap')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const panoramaRef = useRef<unknown>(null) // AMap.Panorama or BMap.Panorama instance
  const containerRef = useRef<HTMLDivElement>(null)

  // Convert coordinates once
  const coords = useMemo(() => {
    if (!point) return null
    const [gLat, gLng] = wgs84ToGcj02(point.lat, point.lng)
    const [bLat, bLng] = gcj02ToBd09(gLat, gLng)
    return { gcjLat: gLat, gcjLng: gLng, bdLat: bLat, bdLng: bLng }
  }, [point])

  // Fallback URLs for "open in new tab"
  const fallbackUrls = useMemo(() => {
    if (!coords) return { amap: '', baidu: '' }
    return {
      amap: `https://uri.amap.com/streetview?streetview=1&lng=${coords.gcjLng.toFixed(6)}&lat=${coords.gcjLat.toFixed(6)}&heading=0&pitch=0&fov=90`,
      baidu: `https://map.baidu.com/?newmap=1&reqCode=1&subsubType=0&gallerytype=0&streetview=1&lng=${coords.bdLng.toFixed(6)}&lat=${coords.bdLat.toFixed(6)}&z=18`,
    }
  }, [coords])

  // Cleanup panorama instance
  const destroyPanorama = () => {
    if (panoramaRef.current) {
      try {
        const pano = panoramaRef.current as { destroy: () => void }
        pano.destroy()
      } catch { /* ignore */ }
      panoramaRef.current = null
    }
  }

  // Initialize panorama when provider or point changes
  useEffect(() => {
    if (!point || !coords || !containerRef.current) return

    setLoadState('loading')
    setErrorMsg('')
    destroyPanorama()

    // Clear container
    containerRef.current.textContent = ''

    const init = async () => {
      try {
        if (provider === 'amap') {
          await loadAmapApi()
          if (!containerRef.current) return
          const panorama = new AMap.Panorama(containerRef.current, {
            position: [coords.gcjLng, coords.gcjLat],
            fov: 90,
            heading: 0,
            pitch: 0,
          })
          panoramaRef.current = panorama
        } else {
          await loadBaiduApi()
          if (!containerRef.current) return
          const panorama = new BMap.Panorama(containerRef.current, {
            navigationControl: true,
            linksControl: true,
            addressControl: false,
          })
          panorama.setPosition(new BMap.Point(coords.bdLng, coords.bdLat))
          panorama.enableScrollWheelZoom()
          panoramaRef.current = panorama
        }
        setLoadState('ready')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMsg(msg)
        setLoadState('error')
      }
    }

    init()

    return () => {
      destroyPanorama()
    }
  }, [provider, point, coords])

  // Provider switch handler
  const handleProviderSwitch = (p: Provider) => {
    if (p === provider) return
    setProvider(p)
  }

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

  const hasKey = provider === 'amap' ? !!AMAP_KEY : !!BAIDU_AK

  return (
    <div className="fixed inset-0 z-[2000] flex">
      {/* 遮罩 */}
      <div className="flex-1 bg-black/20" onClick={onClose} />

      {/* 侧面板 */}
      <div className="w-[520px] max-w-[95vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* ── 头部 ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              📸 采样点 {point.id} 街景
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              WGS-84: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              {coords && (
                <span className="ml-2 text-gray-400">
                  | GCJ-02: {coords.gcjLat.toFixed(5)}, {coords.gcjLng.toFixed(5)}
                </span>
              )}
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
              { key: 'amap' as Provider, label: '📍 高德街景', color: 'blue' as const },
              { key: 'baidu' as Provider, label: '🔍 百度街景', color: 'red' as const },
            ]
          ).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => handleProviderSwitch(key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                provider === key
                  ? color === 'blue'
                    ? 'text-blue-700 border-blue-600 bg-blue-50/50'
                    : 'text-red-700 border-red-600 bg-red-50/50'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
              {!((key === 'amap' ? AMAP_KEY : BAIDU_AK)) && (
                <span className="ml-1 text-[10px] text-orange-400">⚠ 无Key</span>
              )}
            </button>
          ))}
        </div>

        {/* ── 街景内容 ── */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {!hasKey ? (
            /* No API key configured — show guidance + fallback */
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 px-6">
              <div className="text-5xl mb-4">🔑</div>
              <p className="text-sm mb-1 font-medium text-gray-600">
                {provider === 'amap' ? '高德' : '百度'}街景 API Key 未配置
              </p>
              <p className="text-xs text-gray-400 mb-4 text-center">
                {provider === 'amap' ? (
                  <>
                    请在 <code className="bg-gray-100 px-1 rounded">.env</code> 中设置{' '}
                    <code className="bg-gray-100 px-1 rounded">VITE_AMAP_KEY</code>
                    <br />申请地址：
                    <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                      console.amap.com
                    </a>
                  </>
                ) : (
                  <>
                    请在 <code className="bg-gray-100 px-1 rounded">.env</code> 中设置{' '}
                    <code className="bg-gray-100 px-1 rounded">VITE_BAIDU_AK</code>
                    <br />申请地址：
                    <a href="https://lbsyun.baidu.com/apiconsole/key" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                      lbsyun.baidu.com
                    </a>
                  </>
                )}
              </p>
              <a
                href={fallbackUrls[provider]}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
              >
                在新标签页打开街景 →
              </a>
            </div>
          ) : loadState === 'error' ? (
            /* API load error */
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 px-6">
              <div className="text-5xl mb-4">⚠️</div>
              <p className="text-sm mb-1 font-medium text-gray-600">街景加载失败</p>
              <p className="text-xs text-gray-400 mb-4 text-center">{errorMsg}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setLoadState('loading')
                    setErrorMsg('')
                    // Force re-init by changing provider briefly
                    const other: Provider = provider === 'amap' ? 'baidu' : 'amap'
                    setProvider(other)
                    setTimeout(() => setProvider(provider), 50)
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  重试
                </button>
                <a
                  href={fallbackUrls[provider]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                >
                  新标签页打开 →
                </a>
              </div>
            </div>
          ) : (
            /* Panorama container */
            <>
              {loadState === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                  <div className="flex flex-col items-center text-gray-400">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3" />
                    <p className="text-sm">
                      正在加载{provider === 'amap' ? '高德' : '百度'}街景...
                    </p>
                  </div>
                </div>
              )}
              <div
                ref={containerRef}
                className="flex-1 w-full"
                style={{ minHeight: '400px' }}
              />
            </>
          )}
        </div>

        {/* ── 底部操作栏 ── */}
        <div className="px-5 py-3 border-t bg-gray-50/50 flex gap-3">
          <a
            href={fallbackUrls[provider]}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center py-2.5 rounded-lg text-sm font-medium transition-colors bg-gray-200 text-gray-600 hover:bg-gray-300"
          >
            在新标签页打开 →
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
