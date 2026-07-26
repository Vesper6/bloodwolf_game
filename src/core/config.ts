/** 《血狼》M0 数值配置（对应 GDD 第8章） */

export const CFG = {
  /** 生存目标（秒）：M0 原型 15 分钟 */
  winTime: 900,

  player: {
    maxHp: 100,
    speed: 235,
    radius: 16,
    /** 接触伤害每秒上限（防止怪物堆叠秒杀） */
    maxContactDps: 45,
    critChance: 5,   // %
    critDmg: 200,    // %
    pickupRange: 90,
    lowHpDmgBonus: 1.5, // 雷加被动：血量越低伤害越高，满值 +150%
  },

  rage: {
    energyMax: 100,
    energyPerKill: 2.5,
    duration: 10,
    hasteBonus: 100, // %
    lifesteal: 0.2,
  },

  /** 经验需求 = base × growth^(level-1) */
  xp: { base: 8, growth: 1.17 },
  /** 宝石价值随分钟数成长，保持中后期升级节奏 */
  gemValueGrowthPerMin: 0.2,

  /** 怪物成长：HP × hpGrowth^分钟 */
  enemyHpGrowthPerMin: 1.13,
  enemyDmgGrowthPerMin: 0.08,
  maxEnemies: 320,
  maxGems: 260,

  bossTimes: [300, 600] as number[],
}

export type EnemyKind = 'bat' | 'skeleton' | 'boar' | 'elite' | 'boss'

export interface EnemyDef {
  hp: number; speed: number; dmg: number; xp: number; r: number
  color: number; unlockAt: number; weight: number
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  bat:      { hp: 14,   speed: 155, dmg: 5,  xp: 1,   r: 10, color: 0x8a4fd0, unlockAt: 0,   weight: 5 },
  skeleton: { hp: 34,   speed: 100, dmg: 10, xp: 2,   r: 13, color: 0xc8c8d8, unlockAt: 60,  weight: 4 },
  boar:     { hp: 90,   speed: 72,  dmg: 16, xp: 4,   r: 18, color: 0xa8622e, unlockAt: 180, weight: 3 },
  elite:    { hp: 850,  speed: 85,  dmg: 22, xp: 40,  r: 26, color: 0xffb02e, unlockAt: 120, weight: 0 },
  boss:     { hp: 3600, speed: 58,  dmg: 32, xp: 150, r: 42, color: 0xe02222, unlockAt: 0,   weight: 0 },
}

export type WeaponId = 'claw' | 'bow' | 'orb'

export const WEAPON_INFO: Record<WeaponId, { name: string; desc: string }> = {
  claw: { name: '裂空爪', desc: '向面朝方向挥出撕裂爪击，大范围扇形伤害' },
  bow:  { name: '银月长弓', desc: '自动锁定最近的敌人，射出穿透银箭' },
  orb:  { name: '血焰法球', desc: '血焰球环绕自身旋转，灼烧接触的敌人' },
}

/** 被动词条：数值按稀有度 [白, 蓝, 紫, 金]，每种最多叠 5 级 */
export interface PassiveDef { name: string; desc: (v: number) => string; values: number[] }

export const PASSIVE_MAX_LV = 5

export const PASSIVES: Record<string, PassiveDef> = {
  atk:       { name: '狂怒之心', desc: v => `攻击力 +${v}%`, values: [10, 16, 24, 40] },
  haste:     { name: '猎手本能', desc: v => `攻击速度 +${v}%`, values: [8, 12, 18, 30] },
  move:      { name: '疾风之步', desc: v => `移动速度 +${v}%`, values: [6, 10, 15, 25] },
  maxhp:     { name: '狼血沸腾', desc: v => `最大生命 +${v} 并治疗等量生命`, values: [15, 25, 40, 70] },
  pickup:    { name: '血月引力', desc: v => `拾取范围 +${v}%`, values: [20, 30, 45, 70] },
  crit:      { name: '鹰眼', desc: v => `暴击率 +${v}%`, values: [4, 7, 10, 16] },
  critdmg:   { name: '弱点撕裂', desc: v => `暴击伤害 +${v}%`, values: [20, 30, 45, 80] },
  blueprint: { name: '工程蓝图', desc: v => `筑造物伤害 +${v}%`, values: [15, 25, 40, 60] },
}

/** ---------- 武器进化（GDD 5.3）：3级武器 + 对应被动Lv3 + 血月宝箱 ---------- */
export interface EvolutionDef { requires: string; evoName: string; desc: string }

export const EVOLUTIONS: Record<WeaponId, EvolutionDef> = {
  claw: { requires: 'haste', evoName: '千爪风暴', desc: '近身持续旋风，吸附怪物绞杀' },
  bow:  { requires: 'crit',  evoName: '弑神狙',   desc: '每3秒锁定全屏血量最高者，巨额必暴击' },
  orb:  { requires: 'atk',   evoName: '血月熔核', desc: '巨型火球环绕，命中引发连锁爆炸' },
}

/** ---------- 流派标签与共鸣（GDD 6章，M1 实装 3 系） ---------- */
export type TagId = 'blood' | 'crit' | 'build'

export const TAG_NAME: Record<TagId, string> = { blood: '嗜血', crit: '暴击', build: '筑造' }

export const PASSIVE_TAG: Partial<Record<string, TagId>> = {
  atk: 'blood', maxhp: 'blood', crit: 'crit', critdmg: 'crit', blueprint: 'build',
}

export const WEAPON_TAG: Partial<Record<WeaponId, TagId>> = { claw: 'blood', bow: 'crit' }

export const RESONANCE_DESC: Record<TagId, Record<number, string>> = {
  blood: {
    3: '嗜血共鸣 III：击杀恢复 1 点生命',
    5: '嗜血共鸣 V：造成伤害的 2% 转化为治疗',
    7: '嗜血共鸣 VII：生命低于 50% 时伤害 +40%',
  },
  crit: {
    3: '暴击共鸣 III：暴击率 +8%',
    5: '暴击共鸣 V：暴击伤害 +60%',
    7: '暴击共鸣 VII：暴击率溢出部分每 1% 转化 2% 暴伤',
  },
  build: {
    3: '筑造共鸣 III：筑造物攻击间隔 -25%',
    5: '筑造共鸣 V：筑造物完整继承你的攻击力加成',
    7: '筑造共鸣 VII：筑造物射程 +50%，哨塔箭矢穿透 +2',
  },
}

/** ---------- 筑造系统（GDD 7章） ---------- */
export type BuildingId = 'turret' | 'totem' | 'siphon'

export interface BuildingDef { name: string; desc: string; hp: number }

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  turret: { name: '狼牙哨塔', desc: '自动索敌射击，升级提升伤害与射速', hp: 200 },
  totem:  { name: '血祭图腾', desc: '光环范围内持续恢复生命', hp: 160 },
  siphon: { name: '磁能虹吸柱', desc: '大范围吸取经验宝石', hp: 130 },
}

export const MAX_BUILDINGS = 4

/** ---------- 角色（GDD 4章，M3 实装 4 名） ---------- */
export type CharId = 'rega' | 'vera' | 'vivi' | 'kane' | 'gordon' | 'rin' | 'sika' | 'laojin'

export interface CharDef {
  name: string
  role: string
  desc: string
  weapon: WeaponId
  building?: BuildingId
  skill: { name: string; desc: string }
}

export const CHARS: Record<CharId, CharDef> = {
  rega: {
    name: '血狼·雷加', role: '近战爆发', weapon: 'claw',
    desc: '被动：血量越低伤害越高（最高+150%）',
    skill: { name: '血怒', desc: '10秒狼化：攻速+100%，吸血20%' },
  },
  vera: {
    name: '银月·薇拉', role: '远程射手', weapon: 'bow',
    desc: '被动：暴击率+10%，攻速+15%',
    skill: { name: '月影齐射', desc: '向16个方向射出穿透箭雨' },
  },
  vivi: {
    name: '筑造师·薇薇', role: '筑造流', weapon: 'orb', building: 'turret',
    desc: '被动：开局自带哨塔，筑造物伤害+40%',
    skill: { name: '快速筑造', desc: '立刻免费放置/升级一座狼牙哨塔' },
  },
  kane: {
    name: '术狼·卡恩', role: '法术AOE', weapon: 'orb',
    desc: '被动：技能与武器范围+30%',
    skill: { name: '血月陨落', desc: '全屏陨石，重创所有敌人' },
  },
  gordon: {
    name: '铁壁·戈登', role: '坦克/反伤', weapon: 'claw',
    desc: '被动：最大生命+60',
    skill: { name: '磁石护罩', desc: '5秒无敌，接触的敌人被电弧反噬' },
  },
  rin: {
    name: '影刃·凛', role: '暴击刺客', weapon: 'claw',
    desc: '被动：暴击率+15%，暴击伤害+50%',
    skill: { name: '千影闪', desc: '瞬斩周围所有敌人，五连必暴击' },
  },
  sika: {
    name: '毒牙·丝卡', role: '毒瘟DOT', weapon: 'orb',
    desc: '被动：所有攻击叠加毒液（持续掉血，最多8层）',
    skill: { name: '瘟疫领域', desc: '大范围敌人立刻+6层剧毒' },
  },
  laojin: {
    name: '赌狼·老金', role: '经济/运气', weapon: 'bow',
    desc: '被动：幸运大幅提升，拾取范围+50%',
    skill: { name: '掷命骰', desc: '60%获得传说词条，40%失去15%生命' },
  },
}

/** ---------- 地图（GDD 10.1，M3：3 张主题图） ---------- */
export type MapId = 'wasteland' | 'cathedral' | 'neon'

export interface MapDef { name: string; base: number; line: number; dot: number }

export const MAPS: Record<MapId, MapDef> = {
  wasteland: { name: '血月荒原', base: 0x120a10, line: 0x241420, dot: 0x2a1622 },
  cathedral: { name: '沉沦教堂', base: 0x0e1016, line: 0x202a38, dot: 0x32405a },
  neon:      { name: '霓虹废都', base: 0x0a0a16, line: 0x231a4e, dot: 0x3c1a6e },
}

/** ---------- 血月等级（GDD 8.3）：难度层，通关解锁下一层 ---------- */
export const MOON_MAX = 30
/** 第 n 层怪物属性倍率 */
export const moonMul = (lv: number) => Math.pow(1.25, lv - 1)

/** ---------- 血脉天赋（局外成长，GDD 11章） ---------- */
export interface TalentDef { name: string; desc: (lv: number) => string; max: number; cost: (lv: number) => number }

export const TALENTS: Record<string, TalentDef> = {
  atk:   { name: '狼牙', desc: lv => `攻击力 +${lv * 2}%`, max: 10, cost: lv => 25 + lv * 25 },
  hp:    { name: '狼血', desc: lv => `最大生命 +${lv * 10}`, max: 10, cost: lv => 25 + lv * 25 },
  speed: { name: '狼步', desc: lv => `移动速度 +${lv}%`, max: 10, cost: lv => 20 + lv * 20 },
  luck:  { name: '狼运', desc: lv => `三选一高稀有度概率提升 (Lv${lv})`, max: 10, cost: lv => 30 + lv * 30 },
}

export const RARITIES = ['white', 'blue', 'purple', 'gold'] as const
export type Rarity = typeof RARITIES[number]
export const RARITY_WEIGHT = [50, 28, 16, 6]
export const RARITY_NAME: Record<Rarity, string> = { white: '普通', blue: '稀有', purple: '史诗', gold: '传说' }
