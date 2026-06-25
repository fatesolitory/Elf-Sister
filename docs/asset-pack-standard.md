# 素材扩展标准配置规则

## 推荐流程

1. 在后台打开“扩展接口”。
2. 点击“打开扩展素材文件夹”。
3. 复制 `example-pack` 文件夹并改成你的包名，例如 `summer-pack`。
4. 修改新文件夹里的 `manifest.json`。
5. 将新立绘放入该包的 `avatars` 文件夹。
6. 回到后台点击“刷新素材配置”和“检查扩展素材”。

`example-pack` 默认是模板包，`enabled` 为 `false`，不会参与后台切换和健康检查。正式使用的新包需要把 `costumePack.enabled` 和要显示的 `costumes[].enabled` 改为 `true`。

## 文件夹结构

```text
assets/packs/{packId}/manifest.json
assets/packs/{packId}/avatars/{costumeId}_{moodId}.png
```

示例：

```text
assets/packs/summer-pack/manifest.json
assets/packs/summer-pack/avatars/summer_home_idle.png
assets/packs/summer-pack/avatars/summer_home_happy.png
assets/packs/summer-pack/avatars/summer_home_care.png
```

## 命名规则

`packId`、`costumeId`、`moodId` 只使用英文小写、数字和下划线。

推荐格式：

```text
服装 id：summer_home
心情 id：surprised
立绘文件名：summer_home_surprised.png
```

默认立绘匹配规则：

```text
{costumeId}_{moodId}.png
```

如果你想使用不同文件名，在 `avatarOverrides` 中显式绑定：

```json
{
  "summer_home_surprised": "assets/packs/summer-pack/avatars/summer_home_surprised_v2.png"
}
```

## manifest.json 标准

```json
{
  "schemaVersion": 1,
  "costumePack": {
    "id": "summer-pack",
    "name": "夏日服装包",
    "version": "1.0.0",
    "author": "local",
    "root": "assets/packs/summer-pack",
    "enabled": true,
    "description": "夏日主题服装。",
    "costumeIds": ["summer_home"]
  },
  "costumes": [
    {
      "id": "summer_home",
      "name": "夏日居家",
      "description": "夏日主题立绘。",
      "packId": "summer-pack",
      "enabled": true,
      "tags": ["summer", "daily"],
      "modelHint": "适合轻松、日常、夏日场景。",
      "stylePrompt": "夏日居家风格。"
    }
  ],
  "moods": [
    {
      "id": "surprised",
      "name": "惊喜",
      "bubble": "happy",
      "modelHint": "用户表达惊喜、意外、开心时可使用。",
      "expressionPrompt": "惊喜但温柔的表情。"
    }
  ],
  "avatarOverrides": {
    "summer_home_surprised": "assets/packs/summer-pack/avatars/summer_home_surprised.png"
  }
}
```

## 服装规则

`costumes` 中每个服装必须有：

- `id`：稳定 id，用于立绘文件名和大模型判断。
- `name`：后台显示名称。
- `packId`：所属服装包 id。
- `enabled`：是否在后台下拉列表中可选。
- `tags`：给后续大模型判断风格使用。

## 心情规则

`moods` 中每个心情必须有：

- `id`：稳定 id，用于回复规则和立绘文件名。
- `name`：后台显示名称。
- `bubble`：绑定一个已存在气泡 id。

本地回复只会自动切换心情，不会自动切换服装。后续接入大模型后，可以根据 `modelHint`、`stylePrompt`、`expressionPrompt` 判断是否切换服装或心情。

## 立绘完整性

如果一个服装希望支持所有心情，需要准备：

```text
{costumeId}_idle.png
{costumeId}_happy.png
{costumeId}_shy.png
{costumeId}_care.png
{costumeId}_encourage.png
{costumeId}_sleepy.png
```

如果新增了自定义心情，也要为需要支持的服装增加：

```text
{costumeId}_{newMoodId}.png
```

后台“健康检查”会提示缺少哪些 `服装 × 心情` 立绘槽位。
