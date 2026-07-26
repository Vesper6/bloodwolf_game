import { Client, Room } from 'colyseus.js'

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

/** 联机客户端（Colyseus 消息协议，见 server/src/room.ts） */
export class Net {
  room!: Room
  id = ''
  roomId = ''

  static serverUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.hostname}:2567`
  }

  static async connect(action: 'create' | 'join', roomId?: string): Promise<Net> {
    const client = new Client(Net.serverUrl())
    const net = new Net()
    net.room = action === 'create'
      ? await client.create('bloodwolf')
      : await client.joinById(roomId!)
    net.id = net.room.sessionId
    net.roomId = net.room.roomId
    return net
  }

  bind(h: NetHandlers): void {
    const r = this.room
    r.onMessage('welcome', () => {})
    r.onMessage('init', h.onInit)
    r.onMessage('snap', h.onSnap)
    r.onMessage('dead', h.onDead)
    r.onMessage('gem+', h.onGemAdd)
    r.onMessage('gem-', h.onGemRemove)
    r.onMessage('xp', h.onXp)
    r.onMessage('chest+', h.onChestAdd)
    r.onMessage('chest-', h.onChestRemove)
    r.onMessage('boss', h.onBoss)
    r.onMessage('pstate', h.onPState)
    r.onMessage('pleave', h.onPLeave)
    r.onMessage('revived', h.onRevived)
    r.onMessage('over', h.onOver)
  }

  sendState(s: RemotePlayerState): void { this.room.send('state', s) }
  sendHits(hits: [number, number][]): void { if (hits.length) this.room.send('hits', hits) }
  claimGem(id: number): void { this.room.send('gem', id) }
  claimChest(id: number): void { this.room.send('chest', id) }
  revive(targetId: string): void { this.room.send('revive', targetId) }
}
