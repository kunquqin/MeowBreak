# 会话交接（最近一轮：设置页秒表 / 排序 / 进度条）

> 下一段「粘贴用交接提示」见文末代码块。

## 1. 本会话做了什么、技术决策摘要

### 功能与修复

- **秒表状态隔离**：由全局 `stopwatchByKey` 改为每行 `StopwatchReminderRow` 内 **`useState`**，避免多表共用键或 React 复用导致「复位一条清空多条」。
- **秒表打点**：支持 **`stopwatchRemoveLap`** 删除单条打点并重算计次/分段；列表右侧 hover 显红色圆钮减号。
- **打点列表与滚动**：保持约 **10 条** `max-h-80` + 内部滚动；秒表拖拽时用 **`isSortableDragging`** 对打点区 **`pointer-events-none`**，减少内层滚动抢事件；根样式可加 **`overflow-anchor: none`** 减轻长页跳动。
- **子项排序栈**：子项从 Framer **`Reorder` 改为 `@dnd-kit/sortable`**，解决可变高度下让位时 **相对鼠标大幅错位**；大类仍用 Framer Reorder。
- **dnd-kit 拉伸/压扁**：关闭 **`animateLayoutChanges`**，且 **`transform` 仅用 `translate3d`**（`sortableTranslateOnly`），避免 `useDerivedTransform` 的 **scaleY** 把矮/高卡片拉变形。
- **进度条时间气泡**：`SegmentProgressBars` 内在文案 **truncate** 且 **`scrollWidth > clientWidth`** 时，hover 条身在 **居中上方** 显示 **绿/蓝底白字** 气泡（尖角朝下）；完整显示则不出现。外层 `group` + 内层 `overflow-hidden` 条形容器，避免气泡被裁切。

### 技术决策（约定）

| 主题 | 决策 |
|------|------|
| 多秒表运行时状态 | 每子项组件内 `useState`，不落盘 |
| 子项拖拽 | dnd-kit sortable；大类拖拽 Framer Reorder |
| dnd-kit + 变高 | `animateLayoutChanges: () => false` + 仅平移 transform |
| 进度条截断提示 | 仅截断时 hover 气泡；颜色与条（绿/蓝）一致 |

---

## 2. AGENTS.md

已补充 **4.8 秒表**、**4.9 SegmentProgressBars**，修正 **4.7** 首条（避免写「子项也用 Framer Reorder」）；目录 **3.2** 已写明 `components/`、`utils/` 中现有模块示例。

---

## 3. Cursor Rules

| 文件 | 作用 |
|------|------|
| **`.cursor/rules/settings-sortable.mdc`**（新建） | 子项用 dnd-kit、勿用 Framer 排子项；变高时禁用 scale 类 derived transform |
| `settings-drag.mdc` / `save-and-reset.mdc` / `workbreak.mdc` | 仍适用；与本轮不冲突 |

---

## 4. 新会话开头可粘贴的交接提示

```
【WorkBreak — 新会话交接】

请先读 AGENTS.md（尤其 4.7～4.9）。

- 秒表：每条子项状态在 StopwatchReminderRow 的 useState，不用全局 Map；逻辑在 utils/stopwatchUtils.ts；可删单条打点（stopwatchRemoveLap）。
- 子项排序：@dnd-kit/sortable（SortableSubReminderItem + DndContext）；大类仍 Framer Reorder。变高列表不要用 Framer 排子项。
- dnd-kit：useSortable 要 animateLayoutChanges: () => false，transform 只用 translate3d（见 sortableTranslateOnly），否则拖过另一行会 scaleY 拉扁/拉高卡片。
- 进度条文案：SegmentProgressBars.tsx；truncate 且测量为截断时才在 hover 时显示绿/蓝气泡；结构要外层 group、内层 overflow-hidden 以免裁切气泡。
- 详细约定：AGENTS.md 4.7–4.9；子项排序细节：.cursor/rules/settings-sortable.mdc。
```
