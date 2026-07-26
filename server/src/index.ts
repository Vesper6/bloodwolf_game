import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { BloodWolfRoom } from './room'

const port = Number(process.env.PORT || 2567)

const gameServer = new Server({
  transport: new WebSocketTransport({}),
})

gameServer.define('bloodwolf', BloodWolfRoom)

gameServer.listen(port).then(() => {
  console.log(`[血狼] 联机服务器已启动: ws://0.0.0.0:${port}`)
})
