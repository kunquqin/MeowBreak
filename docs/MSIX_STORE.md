# 微软商店（MSIX / AppX）打包说明

## 可以转吗？

可以。本项目使用 **electron-builder** 的 **`appx` 目标**：生成 **`.appx`** 安装包。合作伙伴中心接受 **`.appx` / `.msix`** 等包类型；Electron 官方也推荐通过此类清单包上架（与裸 `.exe` / NSIS 相比，更符合商店流水线）。

> **注意**：`appx` **仅在 Windows 10/11 上打包**，且需要本机已安装 **Windows SDK**（含 `makeappx.exe`）。一般装了 **Visual Studio** 或「Windows 桌面开发」工作负载即可。

## 与本机 `exe` 报错的关系

- 商店侧常见要求：**受限发布、签名、清单（manifest）**，NSIS 安装包往往不直接作为商店二进制提交。
- **桌面分发**仍可使用：`npm run build:win`（NSIS + 便携版）。
- **商店上传**：使用下面 **`npm run build:win:store`** 生成的 `.appx`。

## 打包命令

```bash
npm run build:win:store
```

产物示例：`release/MeowBreak-0.1.0-Store.appx`（实际文件名随版本变化）。

## 上架前必改：`package.json` → `build.appx`

1. **`identityName`**  
   必须与合作伙伴中心为应用保留的 **软件包标识中的 Name** 完全一致（形如 `PublisherName.AppName`，仅字母数字、点、短横线，长度 3～50）。

2. **`publisher`**（提交正式包时）  
   必须与 **用于签名的 .pfx 证书** 的主题（Subject）一致；合作伙伴中心「产品管理」里会给出与帐户一致的发布者字符串（常见为 `CN=...` 一段）。  
   本地试打包、未配置代码签名时，electron-builder 会使用占位发布者生成清单，**仅作本机验证，不能直接当正式商店包**。

3. **`publisherDisplayName`**  
   显示给用户的发布者名称（可与 `author` 一致）。

4. **代码签名（正式提交）**  
   配置证书后由 electron-builder 对 `.appx` 签名，例如环境变量：
   - `CSC_LINK`：指向 `.pfx` 文件路径或 base64  
   - `CSC_KEY_PASSWORD`：证书密码  

   具体以 electron-builder [Windows 代码签名](https://www.electron.build/code-signing) 为准。

## 可选：商店磁贴图

在仓库中放置目录 **`build/appx/`**，放入 PNG（可参考 electron-builder 默认尺寸）：  
`StoreLogo.png`、`Square44x44Logo.png`、`Square150x150Logo.png`、`Wide310x150Logo.png` 等。未提供时使用工具链内置占位图。

## 版本号

商店对**单调递增**版本有要求。更新 `package.json` 的 `version` 后再打商店包。
