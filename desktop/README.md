# ZALEANAI 桌面版

这个目录把纯静态的 Next.js 应用包成 Windows 单文件 exe 和安装程序，做法与
`作业发布系统` 相同：**系统自带的 C# 编译器** + 内嵌网页资源 + 本地回环服务 +
Edge/Chrome 应用窗口。运行 exe 不需要 Node、不需要 .NET SDK。

## 构建

```bash
npm run dist:win
```

等价于：

```bash
npm run build                 # 生成 out/ 静态导出
node desktop/build-exe.mjs    # → dist/ZALEANAI.exe（便携版，单文件）
node desktop/build-setup.mjs  # → dist/安装/ZALEANAI安装程序.exe
```

只改桌面壳、不改网页时，可以跳过 `npm run build`，直接跑后两条命令。

需要：

- Windows 自带的 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`
  （默认路径不对时用环境变量 `CSC` 指定）；
- `desktop/icon.ico`（由 `app/icon.png` 生成，已提交）。

## 运行方式

`ZALEANAI.exe` 做三件事：

1. 把 `out/**` 内嵌资源挂到 `http://127.0.0.1:47821/`；
2. 用 Edge（没有则 Chrome）的 `--app` 模式打开独立窗口；
3. 托盘常驻，菜单里有「打开 ZALEANAI」「打开数据文件夹」「退出」。

关闭窗口不会退出服务；要完全退出，右键任务栏右下角的 ZALEANAI 托盘图标 → 退出。

端口固定为 `47821`，这样每次启动的 origin 相同，localStorage 里的对话才不会
因为端口变化而“消失”。如果端口被别的程序占用，启动器会提示。

## 数据位置

所有对话相关的数据都在 **`D:\ZALEANAI\data`**：

| 路径               | 内容                                       |
| ------------------ | ------------------------------------------ |
| `config.json`      | 模型端点配置，可直接编辑；改完在应用里刷新 |
| `browser-profile/` | 对话、设置、模型选择等浏览器本地存储       |
| `使用说明.txt`     | 给使用者看的说明                           |
| `launcher.log`     | 启动/卸载日志                              |

- 首次启动会创建目录、写入默认 `config.json`（Ollama `llama3.2-vision`）。
- 没有 D 盘或 D 盘不可写时，自动退到
  `%LOCALAPPDATA%\ZALEANAI\data`，并在 `launcher.log` 里写明。
- 备份：复制整个 `data` 文件夹；或在应用内 设置 → 数据 → 导出对话。
- 安装程序默认装到 `D:\ZALEANAI\app`，**卸载不会删除数据目录**。

## 模型配置

默认 `config.json` 指向本机 Ollama：

```json
{
    "id": "ollama-vision",
    "name": "Ollama 视觉模型",
    "baseUrl": "http://127.0.0.1:11434/v1",
    "type": "openai",
    "model": "llama3.2-vision",
    "streaming": true,
    "modalities": { "image": true }
}
```

换成学校的 API 时改 `baseUrl`、`model`、`apiKey`。视觉模型要保留
`"modalities": { "image": true }`，否则摄像头和画板按钮会被禁用。

Ollama 需要允许应用窗口的 origin：

```bash
set OLLAMA_ORIGINS=http://127.0.0.1:47821
```

（或测试时用 `*`）。

## 安装程序

`dist\安装\ZALEANAI安装程序.exe`：

- 默认安装到 `D:\ZALEANAI\app`，可改；不允许装到包含 `D:\ZALEANAI\data` 的目录；
- 创建开始菜单「ZALEANAI」和「卸载 ZALEANAI」快捷方式，桌面快捷方式可选；
- 写入当前用户的卸载登记（设置 → 应用里能看到）；
- 静默安装：`ZALEANAI安装程序.exe /S`
- 卸载：开始菜单里的「卸载 ZALEANAI」，或 `D:\ZALEANAI\app\ZALEANAI.exe --uninstall`

## 注意

- exe 没有代码签名，首次运行时 Windows SmartScreen 可能提示“未知发布者”，
  选择“更多信息 → 仍要运行”。
- 杀毒软件可能误报自解压/内嵌资源；可把安装目录加入信任。
- 网页内容是构建时的快照；改了 `app/`、`components/` 等源码后要重新
  `npm run dist:win`。
- 便携版 `ZALEANAI.exe` 和安装版共用 `D:\ZALEANAI\data`，可以互相替换。
