extends Node2D
## 《血狼》Godot 版主循环（M0 核心：三武器/怪物潮/三选一/三合一/Boss/胜负）
## 数值与 PixiJS 版 src/core/config.ts 对齐

const EnemyScript := preload("res://scripts/enemy.gd")
const PlayerScript := preload("res://scripts/player.gd")
const WIN_TIME := 900.0

var player: Node2D
var cam: Camera2D
var enemies: Array[Node2D] = []
var arrows: Array[Dictionary] = []
var gems: Array[Dictionary] = []
var orb_nodes: Array[Sprite2D] = []

var game_time := 0.0
var kills := 0
var total_damage := 0.0
var max_hit := 0.0
var spawn_timer := 0.0
var elite_timer := 0.0
var boss_idx := 0
var boss: Node2D = null
var game_over := false

# 武器：id -> {level, copies}
var weapons := {"claw": {"level": 1, "copies": 1}}
var claw_timer := 0.0
var bow_timer := 0.0
var orb_angle := 0.0

@onready var hud_timer: Label = %TimerLabel
@onready var hud_kills: Label = %KillsLabel
@onready var hud_weapons: Label = %WeaponLabel
@onready var hp_bar: ColorRect = %HPFill
@onready var xp_bar: ColorRect = %XPFill
@onready var levelup_panel: PanelContainer = %LevelUp
@onready var card_buttons: Array[Button] = [%Card1, %Card2, %Card3]
@onready var flash_rect: ColorRect = %Flash
@onready var end_label: Label = %EndLabel

var gem_tex: Texture2D = preload("res://assets/enemy_bat.png") # 占位，_ready 里替换


func _ready() -> void:
	player = Node2D.new()
	player.set_script(PlayerScript)
	add_child(player)
	cam = Camera2D.new()
	player.add_child(cam)
	cam.make_current()
	levelup_panel.hide()
	end_label.hide()
	for i in range(3):
		var idx := i
		card_buttons[i].pressed.connect(func(): _pick_card(idx))
	# 经验宝石纹理：程序化小菱形
	var img := Image.create(12, 12, false, Image.FORMAT_RGBA8)
	for y in range(12):
		for x in range(12):
			if absi(x - 6) + absi(y - 6) <= 5:
				img.set_pixel(x, y, Color(0.31, 0.85, 1.0))
	gem_tex = ImageTexture.create_from_image(img)


func _process(delta: float) -> void:
	if game_over:
		if Input.is_key_pressed(KEY_ENTER):
			get_tree().reload_current_scene()
		return
	game_time += delta
	if game_time >= WIN_TIME:
		_end(true)
		return
	_update_spawner(delta)
	_update_weapons(delta)
	_update_enemies(delta)
	_update_arrows(delta)
	_update_gems(delta)
	_update_hud()
	if Input.is_key_pressed(KEY_SPACE) and player.energy >= 100 and not player.raging:
		player.raging = true
		player.rage_timer = 10.0
		player.energy = 0
		_flash()


# ---------------- 刷怪（数值同页游版） ----------------

func _update_spawner(delta: float) -> void:
	var minutes := game_time / 60.0
	spawn_timer -= delta
	if spawn_timer <= 0:
		spawn_timer = clampf(1.2 - minutes * 0.08, 0.3, 1.2)
		var count := mini(2 + int(game_time / 20.0), 16)
		for i in range(count):
			if enemies.size() >= 320:
				break
			_spawn(_pick_kind())
	if game_time >= 120.0:
		elite_timer -= delta
		if elite_timer <= 0:
			elite_timer = 45.0
			_spawn("elite")
	if boss_idx < 2 and game_time >= [300.0, 600.0][boss_idx]:
		boss_idx += 1
		var b := _spawn("boss")
		b.max_hp *= boss_idx * 2
		b.hp = b.max_hp
		boss = b
		_flash()


func _pick_kind() -> String:
	var pool: Array[String] = []
	for k in ["bat", "skeleton", "boar"]:
		if game_time >= EnemyScript.DEFS[k].unlock:
			for i in range(5 if k == "bat" else (4 if k == "skeleton" else 3)):
				pool.append(k)
	return pool.pick_random()


func _spawn(kind: String) -> Node2D:
	var e := Node2D.new()
	e.set_script(EnemyScript)
	var minutes := game_time / 60.0
	e.position = player.position + Vector2.RIGHT.rotated(randf() * TAU) * 640.0
	add_child(e)
	e.setup(kind, pow(1.13, minutes), 1.0 + minutes * 0.08, player)
	enemies.append(e)
	return e


# ---------------- 武器（裂空爪/银月长弓/血焰法球） ----------------

func weapon_dmg(id: String, base: float) -> float:
	var w: Dictionary = weapons[id]
	return base * pow(2.2, w.level - 1) * (1.0 + 0.15 * (w.copies - 1))


func _update_weapons(delta: float) -> void:
	var haste: float = player.haste_mul()
	if weapons.has("claw"):
		claw_timer += delta
		if claw_timer >= 0.9 / haste:
			claw_timer = 0
			var lv: int = weapons.claw.level
			var range_px := 130.0 + 35.0 * (lv - 1)
			var arc := deg_to_rad(120.0 + 40.0 * (lv - 1))
			var fang: float = player.facing.angle()
			for e in enemies.duplicate():
				var off: Vector2 = e.position - player.position
				if off.length() < range_px + e.radius and absf(angle_difference(off.angle(), fang)) < arc / 2:
					deal_damage(e, weapon_dmg("claw", 16.0))
	if weapons.has("bow"):
		bow_timer += delta
		if bow_timer >= 1.1 / haste and not enemies.is_empty():
			bow_timer = 0
			var lv2: int = weapons.bow.level
			var targets := enemies.duplicate()
			targets.sort_custom(func(a, b): return a.position.distance_squared_to(player.position) < b.position.distance_squared_to(player.position))
			for i in range(mini(lv2, targets.size())):
				_spawn_arrow((targets[i].position - player.position).angle(), weapon_dmg("bow", 22.0), 1 + lv2)
	if weapons.has("orb"):
		var lv3: int = weapons.orb.level
		var want := 1 + lv3
		while orb_nodes.size() < want:
			var s := Sprite2D.new()
			s.texture = gem_tex
			s.modulate = Color(1.0, 0.55, 0.2)
			s.scale = Vector2(1.6, 1.6)
			add_child(s)
			orb_nodes.append(s)
		orb_angle += delta * 2.4
		for i in range(orb_nodes.size()):
			var a := orb_angle + float(i) / want * TAU
			var pos: Vector2 = player.position + Vector2.RIGHT.rotated(a) * (82.0 + 14.0 * lv3)
			orb_nodes[i].position = pos
			for e in enemies.duplicate():
				if e.orb_cd <= 0 and e.position.distance_to(pos) < 16.0 + e.radius:
					e.orb_cd = 0.45
					deal_damage(e, weapon_dmg("orb", 9.0))
					break


func _spawn_arrow(angle: float, dmg: float, pierce: int) -> void:
	var s := Sprite2D.new()
	s.texture = gem_tex
	s.modulate = Color(0.9, 0.93, 1.0)
	s.rotation = angle
	s.position = player.position
	add_child(s)
	arrows.append({"node": s, "vel": Vector2.RIGHT.rotated(angle) * 720.0, "dmg": dmg, "pierce": pierce, "life": 1.4, "hit": []})


func _update_arrows(delta: float) -> void:
	for a in arrows.duplicate():
		a.life -= delta
		a.node.position += a.vel * delta
		for e in enemies.duplicate():
			if a.pierce >= 0 and not a.hit.has(e) and e.position.distance_to(a.node.position) < 12.0 + e.radius:
				a.hit.append(e)
				deal_damage(e, a.dmg)
				a.pierce -= 1
		if a.life <= 0 or a.pierce < 0:
			a.node.queue_free()
			arrows.erase(a)


# ---------------- 伤害/击杀/掉落 ----------------

func deal_damage(e: Node2D, base: float) -> void:
	if not is_instance_valid(e) or e.hp <= 0:
		return
	var mul: float = 1.0 + player.atk_pct / 100.0
	mul *= 1.0 + 1.5 * (1.0 - maxf(0.0, player.hp) / player.max_hp) # 雷加被动
	var crit: bool = randf() * 100.0 < player.crit_chance
	var dmg: float = base * mul * (player.crit_dmg / 100.0 if crit else 1.0)
	e.hp -= dmg
	e.hit_pulse = 1.0
	total_damage += dmg
	max_hit = maxf(max_hit, dmg)
	_damage_text(e.position, dmg, crit)
	if player.raging:
		player.hp = minf(player.max_hp, player.hp + dmg * 0.2)
	if e.hp <= 0:
		_kill(e)


func _kill(e: Node2D) -> void:
	kills += 1
	player.energy = minf(100.0, player.energy + 2.5)
	_drop_gem(e.position, roundi(e.xp * (1.0 + game_time / 60.0 * 0.2)))
	if e == boss:
		boss = null
		_flash()
	enemies.erase(e)
	e.queue_free()


func _drop_gem(pos: Vector2, value: int) -> void:
	if gems.size() >= 260:
		gems.pick_random().value += value
		return
	var s := Sprite2D.new()
	s.texture = gem_tex
	s.position = pos
	add_child(s)
	gems.append({"node": s, "value": value, "attracted": false})


func _update_enemies(delta: float) -> void:
	var contact := 0.0
	for e in enemies:
		if e.position.distance_to(player.position) < e.radius + 16.0:
			contact += e.dmg
	if contact > 0 and not levelup_panel.visible:
		player.hp -= minf(contact, 45.0) * delta
		if player.hp <= 0:
			_end(false)


func _update_gems(delta: float) -> void:
	for g in gems.duplicate():
		var d: float = g.node.position.distance_to(player.position)
		if not g.attracted and d < player.pickup_range:
			g.attracted = true
		if g.attracted:
			g.node.position += (player.position - g.node.position).normalized() * 520.0 * delta
			if d < 24.0:
				player.xp += g.value
				g.node.queue_free()
				gems.erase(g)
				while player.xp >= player.xp_need():
					player.xp -= player.xp_need()
					player.level += 1
					player.hp = minf(player.max_hp, player.hp + player.max_hp * 0.1)
					_open_levelup()


# ---------------- 三选一 / 三合一 ----------------

var card_actions: Array[Callable] = []


func _open_levelup() -> void:
	var options: Array[Array] = []  # [标题, 描述, Callable]
	for id in ["claw", "bow", "orb"]:
		var wname: String = {"claw": "裂空爪", "bow": "银月长弓", "orb": "血焰法球"}[id]
		if not weapons.has(id):
			options.append(["新武器·%s" % wname, "获得后集齐3份可合成", _add_weapon.bind(id)])
		elif weapons[id].level < 3:
			options.append(["%s +1 (%d/3)" % [wname, weapons[id].copies], "集齐3份合成升级(伤害×2.2)", _add_weapon.bind(id)])
	options.append(["狂怒之心", "攻击力+16%", func(): player.atk_pct += 16.0])
	options.append(["猎手本能", "攻速+12%", func(): player.haste_pct += 12.0])
	options.append(["疾风之步", "移速+10%", func(): player.move_pct += 10.0])
	options.append(["狼血沸腾", "生命上限+25并治疗", func():
		player.max_hp += 25.0
		player.hp = minf(player.max_hp, player.hp + 25.0)])
	options.shuffle()
	card_actions.clear()
	for i in range(3):
		card_buttons[i].text = "%s\n%s" % [options[i][0], options[i][1]]
		card_actions.append(options[i][2])
	get_tree().paused = true
	levelup_panel.show()


func _pick_card(i: int) -> void:
	card_actions[i].call()
	levelup_panel.hide()
	get_tree().paused = false


func _add_weapon(id: String) -> void:
	if not weapons.has(id):
		weapons[id] = {"level": 1, "copies": 1}
		return
	weapons[id].copies += 1
	if weapons[id].copies >= 3 and weapons[id].level < 3:
		weapons[id].copies = 1
		weapons[id].level += 1
		_flash()
		for e in enemies.duplicate():  # 合成全屏爆发
			deal_damage(e, weapon_dmg(id, 100.0))


# ---------------- 表现/HUD/结算 ----------------

func _damage_text(pos: Vector2, dmg: float, crit: bool) -> void:
	var l := Label.new()
	l.text = _fmt(dmg)
	l.position = pos + Vector2(randf_range(-12, 12), -20)
	l.add_theme_font_size_override("font_size", 22 if crit else 14)
	l.add_theme_color_override("font_color", Color(1.0, 0.8, 0.23) if crit else Color.WHITE)
	add_child(l)
	var tw := create_tween()
	tw.tween_property(l, "position:y", l.position.y - 30.0, 0.55)
	tw.parallel().tween_property(l, "modulate:a", 0.0, 0.55)
	tw.tween_callback(l.queue_free)


func _fmt(n: float) -> String:
	if n >= 1e8:
		return "%.1f亿" % (n / 1e8)
	if n >= 1e4:
		return "%.1f万" % (n / 1e4)
	return str(maxi(1, roundi(n)))


func _flash() -> void:
	flash_rect.modulate.a = 0.8
	create_tween().tween_property(flash_rect, "modulate:a", 0.0, 0.4)


func _update_hud() -> void:
	hud_timer.text = "%02d:%02d" % [int(game_time) / 60, int(game_time) % 60]
	hud_kills.text = "击杀 %d" % kills
	hp_bar.scale.x = clampf(player.hp / player.max_hp, 0, 1)
	xp_bar.scale.x = clampf(player.xp / player.xp_need(), 0, 1)
	var parts: Array[String] = []
	for id in weapons:
		var wname: String = {"claw": "裂空爪", "bow": "银月长弓", "orb": "血焰法球"}[id]
		parts.append("%s Lv%d(%d/3)" % [wname, weapons[id].level, weapons[id].copies])
	hud_weapons.text = " · ".join(parts) + "  Lv.%d  能量%d%%" % [player.level, int(player.energy)]


func _end(victory: bool) -> void:
	game_over = true
	end_label.text = ("血月退散 · 胜利!" if victory else "你倒下了") + "\n击杀 %d · 总伤害 %s\n按 Enter 重来" % [kills, _fmt(total_damage)]
	end_label.show()
