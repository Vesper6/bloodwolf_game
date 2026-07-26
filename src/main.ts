import { CHARS, CharId, MAPS, MapId, MOON_MAX, TALENTS, WEAPON_INFO } from './core/config'
import { buyTalent, loadMeta, talentLv } from './core/meta'
import { loadAssets } from './game/assets'
import { Game } from './game/Game'
import { Net } from './net/net'

const startScreen = document.getElementById('start-screen')!
const mpStatus = document.getElementById('mp-status')!
const roomInput = document.getElementById('room-input') as HTMLInputElement
const meta = loadMeta()

let selectedChar: CharId = 'rega'
let moonLv = 1
let mapId: MapId = 'wasteland'

// 地图循环切换
const mapBtn = document.getElementById('map-btn')!
mapBtn.addEventListener('click', () => {
  const ids = Object.keys(MAPS) as MapId[]
  mapId = ids[(ids.indexOf(mapId) + 1) % ids.length]
  mapBtn.textContent = `地图：${MAPS[mapId].name}`
})

// ---------- 角色选择 ----------
const charGrid = document.getElementById('char-grid')!
function renderChars(): void {
  charGrid.innerHTML = ''
  for (const [id, def] of Object.entries(CHARS)) {
    const div = document.createElement('div')
    div.className = 'char-opt' + (id === selectedChar ? ' sel' : '')
    div.innerHTML = `
      <div class="co-name">${def.name}</div>
      <div class="co-role">${def.role} · 初始【${WEAPON_INFO[def.weapon].name}】</div>
      <div class="co-desc">${def.desc}</div>
      <div class="co-skill">技【${def.skill.name}】${def.skill.desc}</div>
    `
    div.addEventListener('click', () => { selectedChar = id as CharId; renderChars() })
    charGrid.appendChild(div)
  }
}
renderChars()

// ---------- 血月等级 ----------
const moonLvEl = document.getElementById('moon-lv')!
function renderMoon(): void {
  moonLvEl.textContent = String(moonLv)
  moonLvEl.title = `已解锁至 ${meta.moonUnlocked} 层`
}
document.getElementById('moon-minus')!.addEventListener('click', () => {
  moonLv = Math.max(1, moonLv - 1); renderMoon()
})
document.getElementById('moon-plus')!.addEventListener('click', () => {
  if (moonLv >= meta.moonUnlocked) {
    mpStatus.textContent = `血月等级 ${moonLv + 1} 未解锁：通关第 ${moonLv} 层后开启`
    return
  }
  moonLv = Math.min(MOON_MAX, moonLv + 1); renderMoon()
})
renderMoon()

// ---------- 血脉天赋 ----------
const talentPanel = document.getElementById('talent-panel')!
const crystalEl = document.getElementById('crystal-count')!
function renderTalents(): void {
  crystalEl.textContent = `❖ 血晶 ${meta.crystals}`
  talentPanel.innerHTML = ''
  for (const [key, def] of Object.entries(TALENTS)) {
    const lv = talentLv(meta, key)
    const btn = document.createElement('button')
    btn.className = 'talent-btn'
    btn.disabled = lv >= def.max || meta.crystals < def.cost(lv)
    btn.textContent = lv >= def.max
      ? `${def.name} MAX · ${def.desc(lv)}`
      : `${def.name} Lv${lv} → ${lv + 1}（${def.cost(lv)}血晶）· ${def.desc(lv + 1)}`
    btn.addEventListener('click', () => { if (buyTalent(meta, key)) renderTalents() })
    talentPanel.appendChild(btn)
  }
}
document.getElementById('talent-toggle')!.addEventListener('click', () => {
  talentPanel.classList.toggle('hidden')
  renderTalents()
})
renderTalents()

// ---------- 开局 ----------
const urlRoom = new URLSearchParams(location.search).get('room')
if (urlRoom) {
  roomInput.value = urlRoom
  mpStatus.textContent = `检测到邀请链接，选好角色后点「加入房间」进入 ${urlRoom}`
}

async function begin(net: Net | null): Promise<void> {
  startScreen.classList.add('hidden')
  await loadAssets() // 美术素材（缺失自动回退占位图）
  new Game(net, selectedChar, net ? (net.moonLv || 1) : moonLv, mapId)
  if (net) history.replaceState(null, '', `?room=${net.roomId}`)
}

document.getElementById('start-btn')!.addEventListener('click', () => begin(null))

document.getElementById('host-btn')!.addEventListener('click', async () => {
  mpStatus.textContent = '正在创建房间…'
  try {
    const net = await Net.connect('create', undefined, moonLv)
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
  location.href = location.pathname
})
