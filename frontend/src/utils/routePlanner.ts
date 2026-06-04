/**
 * routePlanner.ts — 高德路线规划封装
 *
 * 使用高德 JS API 2.0 的 AMap.Walking 获取真实路网步行路径。
 * 用户路点(WGS-84) → GCJ-02 → 高德API → 路径折线(GCJ-02) → WGS-84
 *
 * 依赖: VITE_AMAP_KEY 环境变量
 */

import { wgs84ToGcj02, gcj02ToWgs84 } from './coordTransform'
import type { RouteCoord } from '../types'

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || ''

// ─── AMap 类型声明 ──────────────────────────────────────
interface AMapLngLat {
  getLng(): number
  getLat(): number
}

interface AMapWalkingResult {
  routes: Array<{
    distance: number
    time: number
    steps: Array<{
      path: AMapLngLat[]
    }>
  }>
}

interface AMapWalking {
  search(
    origin: [number, number] | AMapLngLat,
    destination: [number, number] | AMapLngLat,
    callback: (status: string, result: AMapWalkingResult) => void,
  ): void
}

declare const AMap: {
  LngLat: new (lng: number, lat: number) => AMapLngLat
  Walking: new () => AMapWalking
  plugin: (name: string, callback: () => void) => void
}

// ─── 动态加载高德 JS API ───────────────────────────────
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

const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || ''

let amapPluginReady = false

async function ensureAmapLoaded(): Promise<void> {
  const w = window as unknown as Record<string, unknown>

  if (!AMAP_KEY) throw new Error('VITE_AMAP_KEY 未配置，无法使用路线规划')

  if (!w['AMap']) {
    // 备用：如果 HTML 同步加载失败，尝试动态加载
    console.warn('[routePlanner] AMap 对象不可用，尝试动态加载...')

    if (AMAP_SECURITY_CODE) {
      w['_AMapSecurityConfig'] = { securityJsCode: AMAP_SECURITY_CODE }
    }

    const loadPromise = loadScript(
      'amap-js-api-route',
      `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`,
    )
    await Promise.race([
      loadPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('高德 JS API 加载超时')), 10_000),
      ),
    ])

    if (!w['AMap']) {
      throw new Error('高德 JS API 加载后 AMap 对象不可用')
    }
    console.log('[routePlanner] AMap JS API 动态加载成功')
  }

  // 用 AMap.plugin() 加载 Walking 插件（官方推荐方式，而非 URL plugin 参数）
  if (amapPluginReady) return

  const AMapObj = w['AMap'] as typeof AMap
  return new Promise<void>((resolve, reject) => {
    AMapObj.plugin('AMap.Walking', () => {
      if (AMapObj.Walking) {
        amapPluginReady = true
        console.log('[routePlanner] AMap.Walking 插件加载成功', {
          securityConfigSet: !!w['_AMapSecurityConfig'],
        })
        resolve()
      } else {
        reject(new Error('AMap.Walking 插件加载失败'))
      }
    })
    // 超时保护
    setTimeout(() => {
      if (!amapPluginReady) {
        reject(new Error('AMap.Walking 插件加载超时'))
      }
    }, 10_000)
  })
}

// ─── 路线规划接口 ──────────────────────────────────────

export interface PlannedRoute {
  /** 路径折线坐标 (WGS-84) — 用于后端 GVI 采样和地图渲染 */
  pathCoords: RouteCoord[]
  /** 路径总距离 (米) */
  distance: number
  /** 预计步行时间 (秒) */
  duration: number
}

/**
 * 规划步行路线：用户路点 → 高德路网 → 折线坐标
 *
 * 如果高德 API 不可用（Key 未配置/网络异常），回退到直线连接。
 *
 * @param waypoints 用户点击的路线点 (WGS-84)
 * @returns PlannedRoute 或 null（路点不足 2 个）
 */
export async function planRoute(waypoints: RouteCoord[]): Promise<PlannedRoute | null> {
  if (waypoints.length < 2) return null

  try {
    await ensureAmapLoaded()
  } catch {
    console.warn('[routePlanner] 高德 API 加载失败，回退直线连接')
    return fallbackStraightLine(waypoints)
  }

  // ⚠️ AMap.Walking 不支持途经点！只有 Driving 支持
  // 策略：如果用户点了多个路点，分段规划（路点A→B, B→C, ...），再拼接
  if (waypoints.length === 2) {
    // 只有起终点，单次规划
    return planSingleSegment(waypoints[0], waypoints[1])
  }

  // 多路点：分段规划后拼接
  console.log(`[routePlanner] 多路点分段规划: ${waypoints.length} 个路点 → ${waypoints.length - 1} 段`)
  const segments = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = await planSingleSegment(waypoints[i], waypoints[i + 1])
    if (!seg) return fallbackStraightLine(waypoints)
    segments.push(seg)
  }

  // 拼接所有段
  const allCoords: RouteCoord[] = []
  let totalDist = 0
  let totalDuration = 0
  for (const seg of segments) {
    // 每段的路径点直接追加（段间连接点可能有微小重复，去重处理）
    for (const coord of seg.pathCoords) {
      if (
        allCoords.length === 0 ||
        Math.abs(coord.lat - allCoords[allCoords.length - 1].lat) > 1e-7 ||
        Math.abs(coord.lng - allCoords[allCoords.length - 1].lng) > 1e-7
      ) {
        allCoords.push(coord)
      }
    }
    totalDist += seg.distance
    totalDuration += seg.duration
  }

  return {
    pathCoords: allCoords,
    distance: totalDist,
    duration: totalDuration,
  }
}

/**
 * 规划单段步行路线（A → B）
 * AMap.Walking.search 只支持起终点，不支持途经点
 */
function planSingleSegment(
  start: RouteCoord,
  end: RouteCoord,
): Promise<PlannedRoute> {
  // WGS-84 → GCJ-02
  const [sGcjLat, sGcjLng] = wgs84ToGcj02(start.lat, start.lng)
  const [eGcjLat, eGcjLng] = wgs84ToGcj02(end.lat, end.lng)

  return new Promise<PlannedRoute>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        console.warn('[routePlanner] 单段规划超时，回退直线')
        resolve(fallbackStraightLine([start, end]))
      }
    }, 10_000) // 单段 10 秒超时

    try {
      const walking = new AMap.Walking()
      console.log('[routePlanner] AMap.Walking.search 调用...', {
        start: [sGcjLng, sGcjLat],
        end: [eGcjLng, eGcjLat],
      })

      // 高德 2.0 步行导航：search(起点, 终点, callback)
      // ⚠️ AMap.Walking 只有 3 个参数！不支持途经点！
      walking.search(
        [sGcjLng, sGcjLat],
        [eGcjLng, eGcjLat],
        (status: string, result: AMapWalkingResult) => {
          console.log('[routePlanner] AMap.Walking.search 回调:', { status, hasRoutes: !!(result?.routes?.length) })
          if (settled) return
          settled = true
          clearTimeout(timer)

          if (status === 'complete' && result.routes && result.routes.length > 0) {
            const route = result.routes[0]
            const pathCoords: RouteCoord[] = []
            for (const step of route.steps) {
              for (const lngLat of step.path) {
                const gcjLat = lngLat.getLat()
                const gcjLng = lngLat.getLng()
                const [wLat, wLng] = gcj02ToWgs84(gcjLat, gcjLng)
                pathCoords.push({ lat: wLat, lng: wLng })
              }
            }

            const deduped = pathCoords.filter(
              (p, i) =>
                i === 0 ||
                Math.abs(p.lat - pathCoords[i - 1].lat) > 1e-7 ||
                Math.abs(p.lng - pathCoords[i - 1].lng) > 1e-7,
            )

            resolve({
              pathCoords: deduped,
              distance: route.distance,
              duration: route.time,
            })
          } else {
            console.warn('[routePlanner] 路线规划失败，回退直线')
            resolve(fallbackStraightLine([start, end]))
          }
        },
      )
    } catch (err) {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        console.warn('[routePlanner] AMap.Walking 创建失败，回退直线', err)
        resolve(fallbackStraightLine([start, end]))
      }
    }
  })
}

/** 直线回退：路点之间直线连接 */
function fallbackStraightLine(waypoints: RouteCoord[]): PlannedRoute {
  let distance = 0
  for (let i = 1; i < waypoints.length; i++) {
    distance += haversine(waypoints[i - 1].lat, waypoints[i - 1].lng, waypoints[i].lat, waypoints[i].lng)
  }
  return {
    pathCoords: [...waypoints],
    distance: Math.round(distance),
    duration: Math.round(distance / 1.4), // 步行 ~5km/h
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
