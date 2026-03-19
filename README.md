# WorkBreak

帮助打工人按时吃饭、起身活动和休息的桌面提醒应用。

## 技术栈

- Electron + React 18 + TypeScript + Tailwind CSS
- Vite + vite-plugin-electron

## 开发

```bash
npm install
npm run dev
```

## 构建与运行

```bash
npm run build
npm run start
```

## 若双击「启动开发环境.bat」被 Windows 拦截（拒绝访问）

Windows 可能因安全策略阻止运行该批处理文件（例如提示“无法打开这些文件”或“Internet 安全设置阻止”），可任选其一：

1. **解除封锁**：在资源管理器中右键 `启动开发环境.bat` → **属性** → 若底部有“安全”相关说明，勾选 **解除封锁** → 确定，再重新双击运行。
2. **改用命令行**：在项目根目录打开 CMD 或 PowerShell，执行：`npm run dev`。

## 文档

- **AGENTS.md**：产品说明、MVP 范围、目录结构及开发约定（面向 AI Agent 与开发者）
