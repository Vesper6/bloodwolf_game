import { Assets, Rectangle, Texture } from 'pixi.js'

/**
 * 美术素材热替换层：把 PNG 放进 public/assets/ 即自动生效，缺失则回退程序化占位图。
 * 动画：横向序列帧拼条（帧为正方形，帧数 = 宽/高），自动切帧。规格见 docs/ASSETS.md
 */

const CHAR_IDS = ['rega', 'vera', 'vivi', 'kane', 'gordon', 'rin', 'sika', 'laojin']
const FILES = [
  ...CHAR_IDS.map(c => `player_${c}`),
  'enemy_bat', 'enemy_skeleton', 'enemy_boar', 'enemy_elite', 'enemy_boss',
  'gem', 'gem_big', 'arrow', 'orb', 'chest',
  'building_turret', 'building_totem', 'building_siphon',
  'ground_wasteland', 'ground_cathedral', 'ground_neon',
]

const frames: Record<string, Texture[]> = {}

export async function loadAssets(): Promise<void> {
  await Promise.all(FILES.map(async name => {
    try {
      const tex: Texture = await Assets.load(`assets/${name}.png`)
      const n = Math.max(1, Math.floor(tex.width / tex.height))
      if (n > 1) {
        const size = tex.height
        frames[name] = Array.from({ length: n }, (_, i) =>
          new Texture(tex.baseTexture, new Rectangle(i * size, 0, size, size)))
      } else {
        frames[name] = [tex]
      }
    } catch { /* 未提供该素材：保持程序化占位 */ }
  }))
}

/** 序列帧（≥1帧），无素材返回 null */
export const getFrames = (key: string): Texture[] | null => frames[key] ?? null
/** 单张纹理（多帧取第一帧） */
export const getTex = (key: string): Texture | null => frames[key]?.[0] ?? null
