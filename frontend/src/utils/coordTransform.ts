/**
 * 坐标转换工具 — WGS-84 ↔ GCJ-02 ↔ BD-09
 *
 * 高德地图使用 GCJ-02 坐标系，百度地图使用 BD-09 坐标系，
 * 数据库存储 WGS-84 原始坐标，需在渲染前转换。
 */

const PI = Math.PI
const A = 6378245.0 // 长半轴
const EE = 0.006693421622965943 // 扁率

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

/** WGS-84 → GCJ-02（高德坐标系） */
export function wgs84ToGcj02(lat: number, lng: number): [number, number] {
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

/** GCJ-02 → WGS-84（逆向近似，精度 < 1m） */
export function gcj02ToWgs84(lat: number, lng: number): [number, number] {
  if (outOfChina(lat, lng)) return [lat, lng]
  const [gLat, gLng] = wgs84ToGcj02(lat, lng)
  return [lat * 2 - gLat, lng * 2 - gLng]
}

/** GCJ-02 → BD-09（百度坐标系） */
export function gcj02ToBd09(lat: number, lng: number): [number, number] {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin((lat * PI * 3000.0) / 180.0)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos((lng * PI * 3000.0) / 180.0)
  return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065]
}
