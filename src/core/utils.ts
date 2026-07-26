export interface Vec2 { x: number; y: number }

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by
  return dx * dx + dy * dy
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 大数缩写：12345 → "1.2万"，350000000 → "3.5亿" */
export function fmtNum(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + '亿'
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '万'
  return String(Math.max(1, Math.round(n)))
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
