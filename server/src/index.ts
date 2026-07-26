import { randomBytes } from 'crypto'
import { RawData, WebSocket, WebSocketServer } from 'ws'
import { EnemySim } from './sim'

/**
 * 《血狼》联机服务器（原生 ws）
 * 稳定性设计：
 * - 心跳 ping/pong，30秒无响应强制断开，防死连接堆积
 * - 每条消息 try/catch 隔离，畸形消息静默丢弃，64KB 载荷上限
 * - 房间逻辑异常单独捕获，不影响其它房间
 * - 空房 60 秒自动回收；进程级 uncaught/unhandled 兜底
 * - 断线重连：客户端携带旧 sessionId 重入同房间
 */

const PORT = Number(process.env.PORT || 2567)
const MAX_CLIENTS = 4

interface PState {
  x: number; y: number; hp: number; maxHp: number
  level: number; downed: boolean; name: string
}

const genId = (n: number) => randomBytes(12).toString('base64url').replace(/[-_]/g, 'a').slice(0, n)

class Room {
  id = genId(6)
  sim = new EnemySim()
  clients = new Map<string, WebSocket>()
  pstates = new Map<string, PState>()
  over = false
  emptySince = Date.now()
  private snapAcc = 0
  private timer: ReturnType<typeof setInterval>

  constructor(public moonLv: number) {
    this.sim.moonLv = moonLv
    let last = Date.now()
    this.timer = setInterval(() => {
      try {
        const now = Date.now()
        const dt = Math.min((now - last) / 1000, 0.2)
        last = now
        if (this.over || this.clients.size === 0) return
        const alive = [...this.pstates.values()].filter(p => !p.downed)
        for (const ev of this.sim.update(dt, alive, Math.max(1, this.clients.size))) {
          this.broadcast(ev.type, ev.data)
        }
        this.snapAcc += dt * 1000
        if (this.snapAcc >= 100) {
          this.snapAcc = 0
          this.broadcast('snap', this.sim.snapshot())
        }
        if (this.sim.time >= this.sim.winTime) {
          this.over = true
          this.broadcast('over', { victory: true })
        }
      } catch (e) {
        console.error(`[room ${this.id}]`, e)
      }
    }, 66)
  }

  broadcast(t: string, d: unknown, except?: string): void {
    const msg = JSON.stringify({ t, d })
    for (const [sid, ws] of this.clients) {
      if (sid !== except && ws.readyState === WebSocket.OPEN) ws.send(msg)
    }
  }

  join(ws: WebSocket, sessionId: string): void {
    const old = this.clients.get(sessionId)
    if (old && old !== ws) old.terminate() // 同会话重连：踢掉旧连接
    this.clients.set(sessionId, ws)
    ws.send(JSON.stringify({ t: 'welcome', d: { id: sessionId, roomId: this.id, moonLv: this.moonLv } }))
    ws.send(JSON.stringify({ t: 'init', d: this.sim.initData() }))
    for (const [id, p] of this.pstates) {
      if (id !== sessionId) ws.send(JSON.stringify({ t: 'pstate', d: { id, ...p } }))
    }
  }

  leave(sessionId: string, ws: WebSocket): void {
    if (this.clients.get(sessionId) !== ws) return // 已被重连接管
    this.clients.delete(sessionId)
    this.pstates.delete(sessionId)
    this.broadcast('pleave', { id: sessionId })
    if (this.clients.size === 0) this.emptySince = Date.now()
  }

  handle(sessionId: string, t: string, d: unknown): void {
    switch (t) {
      case 'state': {
        const s = d as PState
        if (typeof s?.x !== 'number' || typeof s?.y !== 'number') return
        this.pstates.set(sessionId, s)
        this.broadcast('pstate', { id: sessionId, ...s }, sessionId)
        if (!this.over && this.pstates.size >= this.clients.size
          && [...this.pstates.values()].every(p => p.downed)) {
          this.over = true
          this.broadcast('over', { victory: false })
        }
        break
      }
      case 'hits':
        if (Array.isArray(d)) {
          for (const pr of (d as [number, number][]).slice(0, 200)) {
            if (Array.isArray(pr) && pr.length === 2) this.sim.applyHit(pr[0], pr[1])
          }
        }
        break
      case 'gem': {
        const v = this.sim.claimGem(Number(d))
        if (v > 0) {
          this.broadcast('gem-', { id: d, by: sessionId })
          this.broadcast('xp', { v }) // 经验全队共享
        }
        break
      }
      case 'chest':
        if (this.sim.claimChest(Number(d))) this.broadcast('chest-', { id: d, by: sessionId })
        break
      case 'revive': {
        const tgt = this.pstates.get(String(d))
        if (tgt?.downed) {
          tgt.downed = false
          this.broadcast('revived', { id: d })
        }
        break
      }
    }
  }

  dispose(): void { clearInterval(this.timer) }
}

const rooms = new Map<string, Room>()

// 空房回收
setInterval(() => {
  for (const [id, r] of rooms) {
    if (r.clients.size === 0 && Date.now() - r.emptySince > 60_000) {
      r.dispose()
      rooms.delete(id)
    }
  }
}, 30_000)

const wss = new WebSocketServer({ port: PORT, maxPayload: 64 * 1024 })

wss.on('connection', ws => {
  let room: Room | null = null
  let sessionId = ''
  let alive = true
  ws.on('pong', () => { alive = true })
  const hb = setInterval(() => {
    if (!alive) { ws.terminate(); return }
    alive = false
    if (ws.readyState === WebSocket.OPEN) ws.ping()
  }, 30_000)

  ws.on('message', (raw: RawData) => {
    try {
      const { t, d } = JSON.parse(raw.toString()) as { t: string; d?: Record<string, unknown> }
      if (!room) {
        if (t === 'create') {
          room = new Room(Math.max(1, Math.min(30, Number(d?.moonLv) || 1)))
          rooms.set(room.id, room)
          sessionId = genId(9)
          room.join(ws, sessionId)
        } else if (t === 'join') {
          const r = rooms.get(String(d?.roomId ?? ''))
          if (!r) { ws.send(JSON.stringify({ t: 'error', d: '房间不存在' })); return }
          const oldId = typeof d?.sessionId === 'string' ? d.sessionId : ''
          const isReconnect = !!oldId && r.clients.has(oldId)
          if (!isReconnect && r.clients.size >= MAX_CLIENTS) {
            ws.send(JSON.stringify({ t: 'error', d: '房间已满' }))
            return
          }
          sessionId = isReconnect ? oldId : genId(9)
          room = r
          room.join(ws, sessionId)
        }
        return
      }
      room.handle(sessionId, t, d)
    } catch { /* 畸形消息忽略 */ }
  })
  ws.on('close', () => {
    clearInterval(hb)
    if (room && sessionId) room.leave(sessionId, ws)
  })
  ws.on('error', () => { /* 单连接错误不外溢 */ })
})

process.on('uncaughtException', e => console.error('[uncaught]', e))
process.on('unhandledRejection', e => console.error('[unhandled]', e))

console.log(`[血狼] ws 联机服务器已启动: ws://0.0.0.0:${PORT}`)
