import { Game } from './game/Game'
import { Net } from './net/net'

const startScreen = document.getElementById('start-screen')!
const mpStatus = document.getElementById('mp-status')!
const roomInput = document.getElementById('room-input') as HTMLInputElement

// URL 携带 ?room=XXX 时自动填入房号（分享链接加入）
const urlRoom = new URLSearchParams(location.search).get('room')
if (urlRoom) {
  roomInput.value = urlRoom
  mpStatus.textContent = `检测到邀请链接，点击「加入房间」进入 ${urlRoom}`
}

function begin(net: Net | null): void {
  startScreen.classList.add('hidden')
  new Game(net)
  if (net) {
    // 分享链接写入地址栏，方便复制邀请
    history.replaceState(null, '', `?room=${net.roomId}`)
  }
}

document.getElementById('start-btn')!.addEventListener('click', () => begin(null))

document.getElementById('host-btn')!.addEventListener('click', async () => {
  mpStatus.textContent = '正在创建房间…'
  try {
    const net = await Net.connect('create')
    begin(net)
  } catch (e) {
    mpStatus.textContent = `连接失败：${(e as Error).message}（请确认联机服务器已启动）`
  }
})

document.getElementById('join-btn')!.addEventListener('click', async () => {
  const id = roomInput.value.trim()
  if (!id) { mpStatus.textContent = '请先输入房号'; return }
  mpStatus.textContent = `正在加入 ${id}…`
  try {
    const net = await Net.connect('join', id)
    begin(net)
  } catch (e) {
    mpStatus.textContent = `加入失败：${(e as Error).message}`
  }
})

document.getElementById('restart-btn')!.addEventListener('click', () => {
  location.href = location.pathname // 清掉房号参数重开
})
