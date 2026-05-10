# CKAN-CLI — AI-powered REPL for KSP mod management

## 使用方式

### 方式一：独立 EXE（推荐，已可编译）
```
CLI/bin/Debug/net8.0/CKAN-CLI.exe
```
或从源码构建：
```bash
cd CLI
dotnet build
```

### 方式二：集成到 CKAN-M.exe（现代 GUI 项目）
```bash
CKAN-Modern.exe --cli
CKAN-Modern.exe --cli --model qwen2.5-coder
CKAN-Modern.exe --cli --endpoint http://192.168.1.100:11434
```
> ⚠️ ModernGUI 项目当前有一些未完成的代码（重复的 IpcHandler、缺少类型定义），需要先修复这些才能编译通过。

## 共享了什么
无论是独立 EXE 还是集成模式，它们都使用同一个底层的 `JsonConfiguration`，存储在同一条路径下：
- `%APPDATA%/CKAN/` — 配置文件、API keys
- 同一个 Registry (registry.json)
- 同一个 GameInstanceManager

## 项目结构
```
CLI/                          ← 独立项目，可直接构建
├── CKAN-CLI.csproj
├── Program.cs                ← 入口、参数解析、REPL 循环
├── AiClient.cs               ← Ollama 流式 API 客户端
├── ActionExecutor.cs         ← CKAN Core 命令执行器
└── ConsoleRenderer.cs        ← ANSI 渲染（颜色/转圈/表格）

ModernGUI/CLI/                ← 集成到 CKAN-M.exe 的 CLI 代码
├── CliRepl.cs                ← REPL 主循环
├── CliBackend.cs             ← CKAN Core 直接后端
├── AiClient.cs               ← Ollama 流式客户端
└── ConsoleRenderer.cs        ← ANSI 渲染
App.xaml.cs 已修改             ← 检测 --cli 参数启动 REPL
```
