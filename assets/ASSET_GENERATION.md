# 立绘与气泡生成说明

## 统一角色要求

成年女性虚拟桌宠，白发长发，清纯温柔面部，妹妹感，统一五官和发型辨识度。体型为夸张但非露骨的二次元沙漏曲线，明显腰臀比和丰满胸部。所有素材以桌宠立绘、服装和状态表现为主，避免裸露或露骨姿势。

继续避开：哥特、洛丽塔、海精灵、海洋精灵、贝壳鱼尾等风格。

## 服装 ID

- `home`：居家休闲
- `office`：日常通勤
- `street`：休闲街头
- `fitness`：运动健身
- `qipao`：现代旗袍
- `vacation`：简约度假
- `beach_vacation`：沙滩度假
- `academy`：学院风
- `evening`：晚礼服
- `assistant`：轻机械助手
- `nurse`：治愈护理风

## 状态 ID

- `idle`：待机
- `happy`：开心
- `shy`：害羞
- `care`：关心
- `encourage`：鼓励
- `sleepy`：困倦

## 单张立绘提示词模板

```text
Create a full-body transparent-background anime-style desktop companion sprite.
Character: one original adult female virtual companion, long flowing white/silver hair, pure innocent gentle face, soft round eyes, natural blush, delicate small smile, elegant younger-sister feeling.
Body: stylized hourglass silhouette with pronounced waist-to-hip ratio and full bust, tasteful fashion-focused design, no nudity, no explicit pose.
Outfit: {服装描述}.
Mood: {状态描述}.
Pose: standing idle desktop mascot pose, clean silhouette, hands natural, feet visible, generous padding.
Style: high-end 2D character concept art, polished anime illustration, crisp linework, soft painterly rendering, refined fabric texture.
Avoid gothic, lolita, sea elf, mermaid, ocean motifs, exposed nipples, genital visibility, explicit lingerie focus, watermark, extra limbs, malformed hands.

`beach_vacation` 需要保持普通圆润耳朵，不使用尖耳或长耳；六个心情素材应为同一脸部、同一发型和同一套服装的差异化立绘。
```

## 文件命名

输出到 `assets/avatars/{costume}_{mood}.png`，例如：

```text
assets/avatars/home_idle.png
assets/avatars/office_care.png
assets/avatars/evening_happy.png
```

改用 PNG 后，将 `data/assets.json` 的 `avatarPathPattern` 改为：

```json
"assets/avatars/{costume}_{mood}.png"
```

## 气泡素材要求

气泡应为空白底图，不写死文字。文本由应用动态渲染。

建议尺寸：`620x220`，透明背景，保留中心文本安全区。
