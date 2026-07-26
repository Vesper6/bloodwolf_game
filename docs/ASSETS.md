# 《血狼》美术素材替换规格（给 Codex/AI 生图用）

把生成的 PNG 放进 **`public/assets/`**，文件名对上即自动生效；缺失的素材自动回退程序化占位图，可逐张替换。

## 动画格式（动作与流畅性）

- **横向序列帧拼条**：每帧为正方形，从左到右排列，帧数 = 图宽 ÷ 图高（自动识别）。
- 推荐 **4~6 帧行走循环**，首帧兼作待机帧（角色停止移动时停在第1帧）。
- 角色/怪物朝向由代码水平翻转，素材只需画**朝右**。
- 建议单帧 64×64（Boss 128×128），透明背景，游戏内约显示 32~44px。

## 文件清单

| 文件名 | 内容 | 建议帧数 |
| --- | --- | --- |
| `player_rega/vera/vivi/kane/gordon/rin/sika/laojin.png` | 8名角色行走图 | 4~6 |
| `enemy_bat/skeleton/boar/elite/boss.png` | 怪物行走图 | 4 |
| `gem.png` `gem_big.png` | 经验宝石（小/大） | 1 |
| `arrow.png`（朝右）`orb.png` `chest.png` | 箭矢/火球/血月宝箱 | 1 |
| `building_turret/totem/siphon.png` | 哨塔/图腾/虹吸柱 | 1 |
| `ground_wasteland/cathedral/neon.png` | 三张地图地面（128×128 无缝平铺） | 1 |

## Codex 生图提示词模板

```
2D game sprite sheet, [主体描述], 4-frame walk cycle animation laid out
horizontally in one row, each frame exactly 64x64 pixels (total 256x64),
facing right, transparent background, dark fantasy blood moon theme,
crimson and silver palette, hand-painted with neon rim light, top-down
survivor game style, consistent silhouette across frames, game ready
```

主体示例：雷加="berserker werewolf warrior with glowing red claws"；
薇拉="silver-haired wolf archer with moon bow"；Boss="giant crimson demon wolf, 128x128 frames"。
地面："seamless tileable 128x128 ground texture, cracked wasteland under blood moon, top-down"（去掉序列帧措辞）。

## 技术说明

- 加载层：`src/game/assets.ts`（`loadAssets()` 在开局前预载，404 静默回退）。
- 玩家/怪物使用 `AnimatedSprite`：多帧自动播放（玩家 0.16、怪物 0.12 动画速率，60fps 插值渲染保证流畅）；移动时播放、停止时回待机帧；对象池换肤经 `setSkin()`。
- 单帧素材同样支持（当作静态图）。染色效果（血怒变红/中毒变绿/狂暴变红）对替换素材依然生效，请用中性偏亮的底色。
