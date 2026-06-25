# 扩展接口预留说明

本项目已预留四类形象扩展接口：服装包、心情状态、Live2D、GIF 动图。核心配置集中在 `data/assets.json` 和 `data/settings.json`。

## 服装包接口

目录建议：

```text
assets/packs/{packId}/avatars/{costume}_{mood}.png
assets/packs/{packId}/manifest.json
```

`data/assets.json` 中新增：

```json
{
  "id": "summer-pack",
  "name": "夏日服装包",
  "version": "1.0.0",
  "author": "local",
  "root": "assets/packs/summer-pack",
  "enabled": true,
  "description": "新增夏日主题服装。",
  "costumeIds": ["summer_home"]
}
```

同时在 `costumes` 中加入对应服装项。后台“扩展接口”页会统计服装包、服装、心情和立绘槽位数量。

## 心情状态接口

新增心情不需要改 TypeScript 类型，直接在 `data/assets.json` 的 `moods` 中追加：

```json
{
  "id": "surprised",
  "name": "惊喜",
  "bubble": "happy"
}
```

约定：

- `id` 是回复规则、提醒、主动冒泡和立绘文件名使用的稳定标识。
- `name` 是后台显示名称。
- `bubble` 必须指向 `bubbles` 中已经存在的气泡 id。

新增心情后，回复规则可以直接引用：

```json
{
  "id": "surprise",
  "label": "惊喜回应",
  "priority": 70,
  "mood": "surprised",
  "keywords": ["惊喜", "意外"]
}
```

## 立绘矩阵接口

默认静态立绘读取规则：

```text
assets/avatars/generated/{costume}_{mood}.png
assets/avatars/{costume}_{mood}.svg
```

例如新增服装 `summer_home` 和心情 `surprised` 后，默认文件可以放在：

```text
assets/avatars/generated/summer_home_surprised.png
```

如果文件名不符合默认规则，可以在 `avatarOverrides` 中显式指定：

```json
{
  "summer_home_surprised": "assets/packs/summer-pack/avatars/summer_home_surprised_v1.png"
}
```

后台“健康检查”会验证：

- 服装 id 是否重复
- 心情 id 是否重复
- 心情绑定的气泡是否存在
- 服装包引用的服装是否存在
- `服装 × 心情` 立绘矩阵是否缺少槽位

## Live2D 接口

目录建议：

```text
assets/live2d/{modelId}/model.model3.json
assets/live2d/{modelId}/motions/
assets/live2d/{modelId}/expressions/
```

`data/assets.json` 的 `live2dModels` 已预留字段：

- `modelJson`
- `motions`
- `expressions`
- `scale`
- `offsetX`
- `offsetY`

第一版只显示预留层，后续可在 `src/renderer/App.tsx` 中把 `.reserved-renderer` 替换为 Live2D canvas。

## GIF 动图接口

目录建议：

```text
assets/gifs/{animationId}.gif
```

`data/assets.json` 的 `gifAnimations` 已预留：

- `file`
- `mood`
- `costumeId`
- `loop`
- `fps`

后台切换渲染模式为 `GIF 动图` 后，桌宠窗口会尝试使用当前激活 GIF。

## 大模型接口

`data/settings.json` 的 `model` 节点已预留：

- `provider`
- `baseURL`
- `apiKey`
- `model`
- `temperature`
- `maxTokens`
- `contextLength`
- `injectPersona`
- `systemPromptTemplate`
- `timeoutMs`

主进程 `src/main/index.ts` 中的 `sendModelRequest` 是真实模型请求的唯一接入点。后续接入 OpenAI 兼容接口、Ollama 或 LM Studio 时，只需要在该函数内替换模拟返回。
