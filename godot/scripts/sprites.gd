class_name SpriteUtil
## 序列帧工具：横向拼条 PNG → SpriteFrames（与页游版素材规格一致，docs/ASSETS.md）

static func frames_from_strip(path: String, fps := 8.0) -> SpriteFrames:
	var tex: Texture2D = load(path)
	var sf := SpriteFrames.new()
	sf.set_animation_speed("default", fps)
	sf.set_animation_loop("default", true)
	var size := tex.get_height()
	var n := maxi(1, int(tex.get_width() / size))
	for i in range(n):
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(i * size, 0, size, size)
		sf.add_frame("default", at)
	return sf
