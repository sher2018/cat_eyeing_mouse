# Move Sprite 使用说明

## 概述

本目录包含移动动画的雪碧图（Sprite Sheet）及配套样式文件，用于在浏览器扩展中高效播放角色移动动画。

## 文件清单

| 文件 | 说明 |
|------|------|
| `move_sprite.png` | 雪碧图本体，3x3 网格排列，共 9 帧 |
| `move_sprite.css` | CSS 样式文件，包含帧定位与动画定义 |

## 雪碧图规格

- **总尺寸**: 384 × 384 像素
- **单帧尺寸**: 128 × 128 像素
- **网格布局**: 3 列 × 3 行
- **总帧数**: 9 帧
- **帧编号**: 0 ~ 8（从左到右，从上到下）

## 帧位置映射

| 帧编号 | 坐标 (x, y) | CSS 类名 |
|--------|-------------|----------|
| 0 | (0, 0) | `.move-sprite-0` |
| 1 | (128, 0) | `.move-sprite-1` |
| 2 | (256, 0) | `.move-sprite-2` |
| 3 | (0, 128) | `.move-sprite-3` |
| 4 | (128, 128) | `.move-sprite-4` |
| 5 | (256, 128) | `.move-sprite-5` |
| 6 | (0, 256) | `.move-sprite-6` |
| 7 | (128, 256) | `.move-sprite-7` |
| 8 | (256, 256) | `.move-sprite-8` |

## 使用方法

### 1. 引入样式文件

在 HTML 中引入 CSS：

```html
<link rel="stylesheet" href="move_sprite.css">
```

### 2. 显示指定帧

```html
<!-- 显示第 0 帧 -->
<div class="move-sprite move-sprite-0"></div>

<!-- 显示第 5 帧 -->
<div class="move-sprite move-sprite-5"></div>
```

### 3. 播放循环动画

添加 `move-sprite-animated` 类即可自动播放 9 帧循环动画：

```html
<div class="move-sprite move-sprite-animated"></div>
```

默认动画速度为 0.9 秒/循环（约 10fps）。可通过覆盖 `animation-duration` 调整速度：

```css
.move-sprite-animated {
    animation-duration: 0.45s; /* 加速一倍，约 20fps */
}
```

### 4. JavaScript 控制帧切换

```javascript
const sprite = document.querySelector('.move-sprite');
let currentFrame = 0;

function setFrame(frameIndex) {
    sprite.className = 'move-sprite move-sprite-' + frameIndex;
    currentFrame = frameIndex;
}

// 切换到第 3 帧
setFrame(3);
```

## 在 Chrome 扩展中使用

### Manifest V3 配置

在 `manifest.json` 中确保资源可被访问：

```json
{
  "web_accessible_resources": [
    {
      "resources": ["res/spine/move_sprite.png", "res/spine/move_sprite.css"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### Content Script 中动态加载

```javascript
// 加载 CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('res/spine/move_sprite.css');
document.head.appendChild(link);

// 创建动画元素
const sprite = document.createElement('div');
sprite.className = 'move-sprite move-sprite-animated';
document.body.appendChild(sprite);
```

## 重新生成雪碧图

如需修改或重新生成雪碧图，源文件位于 `res/move/` 目录（0.png ~ 8.png）。

使用 PowerShell 重新生成：

```powershell
Add-Type -AssemblyName System.Drawing
# 参考 src/generate_sprite.py 脚本逻辑
```
