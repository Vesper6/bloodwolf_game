import { Client, Room } from '@colyseus/core'
import { EnemySim } from './sim'

/**
 * 血狼联机房间（最多4人）。
 * 协议（消息制，M2 原型）：
 *   客户端→服务端: state{x,y,hp,maxHp,level,downed,name} / hits[[id,dmg]] / gem(id) / chest(id) / revive(sessionId)
 *   服务端→客户端: welcome / init / pstate / pleave / snap / dead / gem+ / gem- / xp / chest+ / chest- / boss / revived / over
 */

interface PState {
  x: number; y: number; hp: number; maxHp: number
  level: number; downed: boolean; name: string
}

export class BloodWolfRoom extends Room {
  maxClients = 4
  private sim = new EnemySim()
  private pstates = new Map<string, PState>()
  private over = false
  private snapAcc = 0
  private moonLv = 1

  onCreate(options?: { moonLv?: number }): void {
    this.moonLv = Math.max(1, Math.min(30, options?.moonLv ?? 1))
    this.sim.moonLv = this.moonLv
    this.onMessage('state', (client, msg: PState) => {
      if (typeof msg?.x !== 'number' || typeof msg?.y !== 'number') return
      this.pstates.set(client.sessionId, msg)
      this.broadcast('pstate', { id: client.sessionId, ...msg }, { except: client })
      // 全灭判定
      if (!this.over && this.pstates.size >= this.clients.length && [...this.pstates.values()].every(p => p.downed)) {
        this.over = true
        this.broadcast('over', { victory: false })
      }
    })

    this.onMessage('hits', (_client, msg: [number, number][]) => {
      if (!Array.isArray(msg)) return
      for (const pair of msg.slice(0, 200)) {
        if (Array.isArray(pair) && pair.length === 2) this.sim.applyHit(pair[0], pair[1])
      }
    })

    this.onMessage('gem', (client, id: number) => {
      const v = this.sim.claimGem(id)
      if (v > 0) {
        this.broadcast('gem-', { id, by: client.sessionId })
        this.broadcast('xp', { v }) // 经验全队共享
      }
    })

    this.onMessage('chest', (client, id: number) => {
      if (this.sim.claimChest(id)) this.broadcast('chest-', { id, by: client.sessionId })
    })

    this.onMessage('revive', (_client, targetId: string) => {
      const t = this.pstates.get(targetId)
      if (t?.downed) {
        t.downed = false
        this.broadcast('revived', { id: targetId })
      }
    })

    this.setSimulationInterval(ms => {
      if (this.over) return
      const dt = Math.min(ms / 1000, 0.2)
      const alive = [...this.pstates.values()].filter(p => !p.downed)
      const events = this.sim.update(dt, alive, Math.max(1, this.clients.length))
      for (const ev of events) this.broadcast(ev.type, ev.data)

      this.snapAcc += ms
      if (this.snapAcc >= 100) {
        this.snapAcc = 0
        this.broadcast('snap', this.sim.snapshot())
      }

      if (this.sim.time >= this.sim.winTime) {
        this.over = true
        this.broadcast('over', { victory: true })
      }
    }, 66)
  }

  onJoin(client: Client): void {
    client.send('welcome', { id: client.sessionId, roomId: this.roomId, moonLv: this.moonLv })
    client.send('init', this.sim.initData())
    // 已有玩家状态同步给新人
    for (const [id, p] of this.pstates) client.send('pstate', { id, ...p })
  }

  onLeave(client: Client): void {
    this.pstates.delete(client.sessionId)
    this.broadcast('pleave', { id: client.sessionId })
  }
}
