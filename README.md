# 桌面陪伴精灵

妹妹系桌面陪伴精灵原型，技术栈为 Electron + React + TypeScript + Vite。

## 当前能力

- 桌宠透明窗口、独立置顶开关窗口、后台控制台窗口
- 后台页面：角色人格、素材与状态、扩展接口、陪伴提醒、桌面行为、模型接口、系统设置
- 置顶、透明度、缩放、隐藏/显示、开机自启动
- 身份文档读取：`identity/persona.md`
- 本地模拟回复：`data/replies.json`
- 气泡素材：`assets/bubbles/generated/`
- 静态立绘素材：`assets/avatars/generated/`
- 扩展接口预留：服装包、Live2D、GIF 动图、大模型

## 运行方式

安装 Node.js 后，在本目录运行：

```powershell
npm install
npm run app:dev
```

只预览网页界面：

```powershell
npm run dev
```

## 关键配置

- `data/assets.json`：服装、心情、气泡、服装包、Live2D、GIF 配置
- `data/settings.json`：当前选中状态、桌面行为、大模型和扩展设置
- `data/replies.json`：聊天自动回复文本池
- `data/reply-rules.json`：本地关键词、优先级、心情匹配规则
- `data/reminder-messages.json`：定时提醒文案，和聊天回复分离
- `data/idle-bubbles.json`：待机主动冒泡文案
- `data/conversations.json`：开启保存聊天记录后写入的对话记录
- `data/key-points.json`：日记本关键点，支持往期询问检索
- `data/backups/`：保存设置、聊天记录和关键点前生成的最近备份
- `logs/app-events.jsonl`：运行事件日志，使用 JSON Lines 格式
- `assets/notebook/diary-open.png`、`assets/notebook/diary-closed.png`：日记本开合状态透明 PNG
- `identity/persona.md`：妹妹身份设定
- `docs/extension-interfaces.md`：扩展接口说明

## 模型接口预留

后台“模型接口”支持粘贴服务链接并规范为标准聊天端点：

- OpenAI 兼容、自定义网关、LM Studio：`<链接>/v1/chat/completions`
- Ollama：`http://127.0.0.1:11434/v1/chat/completions`

启用模型后，会按 OpenAI-compatible 聊天格式请求标准端点，并复用 `identity/persona.md` 和 `data/key-points.json` 的短记忆上下文；请求失败时回退本地回复并写入运行日志。

## 素材规则

静态立绘优先读取：

```text
assets/avatars/generated/{costume}_{mood}.png
```

未生成时回退到：

```text
assets/avatars/{costume}_{mood}.svg
```

可通过后台“扩展接口”关闭“优先使用生成 PNG”。
