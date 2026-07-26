export interface RemotePlayerState {
  x: number; y: number; hp: number; maxHp: number
  level: number; downed: boolean; name: string
}

export interface NetHandlers {
  onSnap: (data: number[]) => void
  onDead: (d: { id: number; x: number; y: number }) => void
  onGemAdd: (d: { id: number; x: number; y: number; v: number }) => void
  onGemRemove: (d: { id: number; by: string }) => void
  onXp: (d: { v: number }) => void
  onChestAdd: (d: { id: number; x: number; y: number }) => void
  onChestRemove: (d: { id: number; by: string }) => void
  onBoss: (d: { id: number; idx: number }) => void
  onPState: (d: { id: string } & RemotePlayerState) => void
  onPLeave: (d: { id: string }) => void
  onRevived: (d: { id: string }) => void
  onOver: (d: { victory: boolean }) => void
  onInit: (d: { time: number; gems: number[]; chests: number[] }) => void
}

/**
 * 联机客户端（原生 WebSocket，协议见 server/src/index.ts）
 * 稳定性：断线自动重连（指数退避，最多8次，携带 sessionId 恢复会话）；
 * welcome 前的消息队列缓存，bind 后按序回放，避免时序竞态。
 */
export class Net {
  id = ''
  roomId = ''
  moonLv = 1
  /** 连接状态回调（Game 用于播报） */
  onStatus: ((msg: string) => void) | null = null

  private ws!: WebSocket
  private handlers: NetHandlers | null = null
  private pending: { t: string; d: unknown }[] = []
  private closed = false
  private action: 'create' | 'join' = 'create'

  static serverUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.hostname}:2567`
  }

  static async connect(action: 'create' | 'join', roomId?: string, moonLv = 1): Promise<Net> {
    const net = new Net()
    net.action = action
    net.roomId = roomId ?? ''
    net.moonLv = moonLv
    await net.open(true)
    return net
  }

  private open(first: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(Net.serverUrl())
      this.ws = ws
      const timeout = setTimeout(() => { ws.close(); reject(new Error('连接超时')) }, 8000)

      ws.onopen = () => {
        ws.send(JSON.stringify(first && this.action === 'create'
          ? { t: 'create', d: { moonLv: this.moonLv } }
          : { t: 'join', d: { roomId: this.roomId, sessionId: this.id || undefined } }))
      }
      ws.onmessage = ev => {
        try {
          const { t, d } = JSON.parse(String(ev.data)) as { t: string; d?: unknown }
          if (t === 'error') { clearTimeout(timeout); reject(new Error(String(d))); return }
          if (t === 'welcome') {
            const w = d as { id: string; roomId: string; moonLv?: number }
            this.id = w.id
            this.roomId = w.roomId
            this.moonLv = w.moonLv ?? this.moonLv
            clearTimeout(timeout)
            this.wire(ws)
            resolve()
            return
          }
          this.dispatch(t, d)
        } catch { /* 畸形消息忽略 */ }
      }
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('无法连接服务器')) }
    })
  }

  /** welcome 之后接管：正常收发 + 断线重连 */
  private wire(ws: WebSocket): void {
    ws.onmessage = ev => {
      try {
        const { t, d } = JSON.parse(String(ev.data)) as { t: string; d?: unknown }
        this.dispatch(t, d)
      } catch { /* ignore */ }
    }
    ws.onerror = () => { /* close 事件统一处理 */ }
    ws.onclose = () => { if (!this.closed) void this.reconnect() }
  }

  private async reconnect(): Promise<void> {
    for (let i = 0; i < 8 && !this.closed; i++) {
      this.onStatus?.(`连接断开，正在重连 (${i + 1}/8)…`)
      await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** i, 8000)))
      try {
        await this.open(false)
        this.onStatus?.('已重新连接')
        return
      } catch { /* 下一轮 */ }
    }
    this.onStatus?.('重连失败，已离线')
  }

  private dispatch(t: string, d: unknown): void {
    if (!this.handlers) { this.pending.push({ t, d }); return }
    const h = this.handlers
    switch (t) {
      case 'init': h.onInit(d as Parameters<NetHandlers['onInit']>[0]); break
      case 'snap': h.onSnap(d as number[]); break
      case 'dead': h.onDead(d as Parameters<NetHandlers['onDead']>[0]); break
      case 'gem+': h.onGemAdd(d as Parameters<NetHandlers['onGemAdd']>[0]); break
      case 'gem-': h.onGemRemove(d as Parameters<NetHandlers['onGemRemove']>[0]); break
      case 'xp': h.onXp(d as Parameters<NetHandlers['onXp']>[0]); break
      case 'chest+': h.onChestAdd(d as Parameters<NetHandlers['onChestAdd']>[0]); break
      case 'chest-': h.onChestRemove(d as Parameters<NetHandlers['onChestRemove']>[0]); break
      case 'boss': h.onBoss(d as Parameters<NetHandlers['onBoss']>[0]); break
      case 'pstate': h.onPState(d as Parameters<NetHandlers['onPState']>[0]); break
      case 'pleave': h.onPLeave(d as Parameters<NetHandlers['onPLeave']>[0]); break
      case 'revived': h.onRevived(d as Parameters<NetHandlers['onRevived']>[0]); break
      case 'over': h.onOver(d as Parameters<NetHandlers['onOver']>[0]); break
    }
  }

  bind(h: NetHandlers): void {
    this.handlers = h
    const q = this.pending
    this.pending = []
    for (const m of q) this.dispatch(m.t, m.d)
  }

  private send(t: string, d: unknown): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t, d }))
  }

  sendState(s: RemotePlayerState): void { this.send('state', s) }
  sendHits(hits: [number, number][]): void { if (hits.length) this.send('hits', hits) }
  claimGem(id: number): void { this.send('gem', id) }
  claimChest(id: number): void { this.send('chest', id) }
  revive(targetId: string): void { this.send('revive', targetId) }
}
