# WorkBreak — Agent 开发指引

本文档为 AI Agent 与开发者提供产品背景、技术约定和实现边界，便于从零协作开发 WorkBreak 桌面应用。

---

## 1. 产品概览

### 1.1 名称与描述

- **产品名称**：WorkBreak（工作代号，后续可改）
- **一句话描述**：帮助长期对着电脑工作的打工人，按时收到可配置的多种提醒（吃饭、活动、休息等）的桌面应用。

### 1.2 目标用户与场景

- **主要用户**：长时间坐在电脑前的上班族、自由职业者、程序员。
- **使用场景**：工作日开着电脑时，容易忘记吃饭、久坐不动、连续工作不休息。

### 1.3 要解决的核心问题

- **现有方案**：手机闹钟、系统日历提醒、便利贴。
- **现有方案的问题**：需手动设置、不够智能、易被忽略、与工作流割裂。
- **本产品**：常驻系统托盘，按计划自动提醒，无需每天重新设置。

---

## 2. 功能边界（MVP）

### 2.1 要做（第一版）

1. **可配置提醒**：用户可新增**闹钟**、**倒计时**或**秒表**大类。闹钟/倒计时规则不变：`categoryKind` 为 `alarm` | `countdown`，子项分别为 `mode: 'fixed'` 与 `mode: 'interval'`。**秒表**大类 `categoryKind: 'stopwatch'`，子项为 `mode: 'stopwatch'`（无提醒文案、无弹窗、不参与主进程定时器）；运行态与打点列表仅存设置页内存，不落盘。旧配置无 `categoryKind` 时由主进程归一化推断。
2. **系统托盘**：后台静默运行，托盘图标与基础菜单。
3. **设置界面**：可增删改大类与子提醒、管理预设、持久化到本地。

### 2.2 不做（第一版）

- 不做健康数据统计与报表。
- 不做团队协作。
- 不做手机端。
- 不做 AI 智能调度。
- 不做日历系统集成。

### 2.3 参考产品

- 类似 [Stretchly](https://github.com/hovancik/stretchly)（开源休息提醒），在此基础上增加**吃饭提醒**和**更友好的设置界面**。

---

## 3. 技术栈与目录结构

### 3.1 技术栈

- **运行时**：Electron（优先支持 Windows，未来兼容 macOS）。
- **前端**：React 18 + TypeScript。
- **样式**：Tailwind CSS。
- **构建**：Vite + vite-plugin-electron。

### 3.2 目录结构

```
01_WorkBreak/
├── AGENTS.md                 # 本文件：产品与开发指引
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
│
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 入口：窗口、托盘、IPC、单实例锁
│   │   ├── settings.ts       # 设置读写与持久化
│   │   ├── reminders.ts      # 可配置提醒的定时与弹窗触发
│   │   └── tray.ts           # 托盘图标与菜单
│   ├── preload/              # 预加载脚本（主进程与渲染进程桥接）
│   │   ├── index.ts          # 源码（Vite 可构建，当前未用于加载）
│   │   └── preload.cjs       # 手写 CommonJS，供 Electron 加载（项目 "type":"module" 下 .js 会被当 ESM）
│   ├── shared/               # 主进程与渲染进程共用类型与默认值（如 settings.ts）
│   └── renderer/             # React 渲染进程（前端）
│       ├── index.html
│       └── src/
│           ├── main.tsx      # React 入口
│           ├── App.tsx       # 根组件
│           ├── index.css     # 全局样式（Tailwind 入口）
│           ├── vite-env.d.ts # 类型声明（含 window.electronAPI）
│           ├── types.ts      # 类型与默认值（可引用 src/shared）
│           ├── pages/        # 页面级组件（如 Settings.tsx）
│           ├── components/   # 通用 UI（如 AddSubReminderModal、SegmentProgressBars）
│           ├── stores/       # 状态（后续添加）
│           ├── hooks/        # 自定义 Hooks（后续添加）
│           └── utils/        # 工具（如 durationFormat、stopwatchUtils）
│
└── out/                      # 构建产物（git 忽略）
    ├── main/
    ├── preload/
    └── renderer/
```

### 3.3 脚本约定

- `npm run dev`：启动 Vite 开发服务器 + Electron，带 HMR。
- `npm run build`：构建主进程 + 预加载 + 渲染进程到 `out/`。
- `npm run start`：使用已构建产物运行 Electron（需先 `npm run build`）。

---

## 4. 开发约定

### 4.1 代码与风格

- 使用 **TypeScript**，开启严格模式；渲染进程与主进程均写 TS。
- 组件与页面使用 **函数组件 + Hooks**，优先 `named export` 便于按需引用。
- 样式以 **Tailwind** 为主，必要时配合 `index.css` 中的少量自定义类。
- 路径别名：`@/` 指向 `src/renderer/src/`，用于 `import '@/components/...'` 等。

### 4.2 跨进程通信

- 仅通过 **preload** 暴露能力给渲染进程；使用 `contextBridge.exposeInMainWorld`，不直接暴露 `require('electron')`。
- **Preload 必须为 CommonJS**：因 `package.json` 含 `"type":"module"`，Electron 用 `require()` 加载 preload，故使用手写 `src/preload/preload.cjs`；开发时主进程从源码加载 `resolve(__dirname, '../../src/preload/preload.cjs')`。
- 在 `src/renderer/src/vite-env.d.ts` 中为 `window.electronAPI` 等扩展类型，保持类型安全。

### 4.3 平台兼容

- 优先保证 **Windows** 行为正确；涉及路径、托盘、通知时考虑 **macOS** 差异（如 `process.platform === 'darwin'`），避免写死 Windows 逻辑，为后续兼容留口子。

### 4.4 状态与持久化

- **设置**：开发环境（有 `VITE_DEV_SERVER_URL`）写入项目根目录 `workbreak-settings.json`，便于排查；生产环境写入 `app.getPath('userData')/settings.json`。主进程启动时 `app.setName('workbreak')` 保证 userData 路径一致。
- **保存设置**：仅将当前配置写入磁盘（`setSettings`），**不**调用 `restartReminders()`、**不**清除闹钟（fixed）override，因此不会重置任何提醒的起始点或进度。
- **全部重置**：设置页提供「全部重置」按钮，调用主进程 `resetAllReminderProgress()`，将所有**闹钟**子项设为“从当前时刻开始”、所有**倒计时**子项从当前时刻重新排程；使用当前已保存的配置（`getSettings()`）。
- 提醒计划、定时器均在主进程 `reminders.ts`，以主进程为“单一事实来源”；应用启动时由 `startReminders()` 排程。

### 4.5 闹钟（mode: fixed）「重置」与起始时间

- **重置**：用户对某条**闹钟**子项点击「重置」时，主进程 `setFixedTimeCountdownOverride(key, item.time)` 会记录该时刻为周期起点（`fixedTimeCycleStartAt.set(key, Date.now())`），并在后续每次 `getReminderCountdowns()` 中返回该**时间戳**作为 `cycleStartAt`（不可用“当前时间”覆盖，否则起始时间会跟着时钟变）。
- **起始时间显示**：列表视图进度条左侧「起始时间」= 该周期的真实起点：有 `cycleStartAt` 时用其格式化为 HH:mm，否则用设定时间 `cd.time`（如 20:00）。不要用 `Date.now()` 作为闹钟子项的起始时间标签。
- **保存后**：保存设置**不**清除 override；仅「全部重置」会按需更新。若需“保存后恢复为按上次设定时间”的语义，再考虑在保存时调用 `clearFixedTimeCountdownOverrides()`（当前未采用）。

### 4.6 单实例与启动

- 使用 `app.requestSingleInstanceLock()` 保证只运行一个实例，避免重复点 bat 或 HMR 重建时多开窗口；二次启动时聚焦已有窗口。
- 开发启动：项目根目录双击 `启动开发环境.bat` 或终端执行 `npm run dev`。

### 4.7 设置页拖拽与排序

- **大类用 Framer Motion Reorder**：主列表为 `Reorder.Group`，每项为 `CategoryCard`（内为 `Reorder.Item` + `useDragControls`）；`onReorder` 调用 `setCategories`，同时 `setPresetModal(null)`、`setPresetDropdown(null)` 避免重排后索引错位。**子项不用 Framer Reorder**（见下条）。
- **子项排序**：大类内容区内使用 **`@dnd-kit/sortable`**（`DndContext` + `SortableContext` + `useSortable`），每行外包一层 `SortableSubReminderItem`，手柄上挂 `listeners`；**不再**用 Framer `Reorder` 排子项。原因：Framer Reorder 在交换 DOM 顺序时，可变高度子项易出现「让位瞬间被拖卡片相对鼠标跳约一行高」的错位；dnd-kit 用 `transform` 跟指针一致。大类列表仍用 Framer `Reorder`。
- **dnd-kit 可变高度**：`useSortable` 默认的 layout 动画会用 `useDerivedTransform` 注入 **scaleY**（旧/新测量框高度比），拖过另一行时矮卡片会被拉高、高卡片会被压扁；子项侧已设 **`animateLayoutChanges: () => false`**，且样式 **`transform` 只用 `translate3d`**，不写 `scale`，避免内容被拉伸。
- **子项 UI**：内层仍为 `SubReminderRow` / `StopwatchReminderRow`（秒表状态仍行内 `useState`）。大类分 `categoryKind`（闹钟 / 倒计时 / 秒表），子项不得跨 kind 移动（`moveItemToCategory` 需同 kind）。
- **拖拽时始终在最上层**：`CategoryCard` 用 `isChildDragging`，在子项 `DndContext` 的 `onDragStart`/`onDragEnd` 与 Framer 大类拖拽一致思路；根大类 `Reorder.Item` 的 `zIndex` 在 `isChildDragging` 时为 10000；子项列表容器 `overflow-visible`，避免裁剪。

### 4.8 秒表（设置页）

- **状态**：每条秒表子项在 **`StopwatchReminderRow`** 内用 **`useState`** 存 `StopwatchRuntime`，**不要**用全局 `Record<key, …>` 映射多条秒表（易因 id/键冲突或 React 复用导致「复位一条清空多条」）。运行中显示可用 `setInterval` ~50ms，仅在该行 `running` 时启用。
- **逻辑**：`src/renderer/src/utils/stopwatchUtils.ts`（`emptyStopwatch`、`stopwatchLap`、`stopwatchRemoveLap`、显示格式化等）；删除单条打点后按时间重算计次与分段。
- **打点列表**：约 10 条可见用 `max-h-80` + 内部滚动；**dnd-kit 拖拽**时对内层滚动区可在 **`isSortableDragging`** 下 **`pointer-events-none`**，避免抢指针。长页可在 `index.css` 等对根滚动设 **`overflow-anchor: none`**，减轻动态增高时的视口跳动。

### 4.9 倒计时进度条上的时段文案（SegmentProgressBars）

- **组件**：`src/renderer/src/components/SegmentProgressBars.tsx`（`SplitSegmentProgressBar`、`SingleCycleProgressBar` 及弹窗内静态预览条）。
- **截断与气泡**：条上标签使用 `truncate`；若测量为 **`scrollWidth > clientWidth`**（`ResizeObserver`），hover **整条**进度条时在**水平居中、条上方**显示与条同色（**绿**/工作、**蓝**/休息）的**白字气泡**，尖角朝下指向条；**未截断则不显示气泡**。
- **结构**：气泡父级与带 `overflow-hidden` 的圆角条**分层**（外层 `group`、内层条形容器），避免气泡被裁切；**不要**对 sortable 包裹误用会引入 **scaleY** 的整段 `transform`（参见 4.7 dnd-kit 条）。

---

## 5. 与 Agent 协作时的注意点

- **先看 AGENTS.md**：实现功能前先对齐本文档中的“要做/不做”和目录结构。
- **MVP 优先**：第一版不实现统计、协作、手机端、AI、日历集成。
- **结构扩展**：新增功能时，组件进 `components/`，页面进 `pages/`，状态/逻辑进 `stores/`、`hooks/`、`utils/`，保持结构清晰。
- **命名**：产品对外名称保持 WorkBreak，代码与资源命名可沿用 `workbreak`/`WorkBreak`，与现有 `package.json` 一致。

---

确认目录与 AGENTS.md 无误后，即可按上述约定开始实现吃饭提醒、活动提醒、休息提醒、托盘与设置界面等 MVP 功能。
