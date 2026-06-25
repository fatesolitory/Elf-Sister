# Live2D 预留目录

将 Live2D Cubism 导出的 `model.model3.json`、贴图、动作和表情文件放到这里，或新建同级模型目录。

随后在 `data/assets.json` 的 `live2dModels` 中登记：

```json
{
  "id": "my-live2d",
  "name": "我的 Live2D 模型",
  "modelJson": "assets/live2d/my-live2d/model.model3.json",
  "enabled": true,
  "scale": 1,
  "offsetX": 0,
  "offsetY": 0,
  "defaultExpression": "idle",
  "motions": {},
  "expressions": {}
}
```
