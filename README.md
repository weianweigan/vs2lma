[English](README.md) | [中文](README.zh-CN.md)

# vs2lma

**vs2lma** is a Windows desktop application that wraps a lightweight proxy server, transforming API requests compatible with **DeepSeek** or **OpenAI** formats into **Ollama** API requests. It enables tools like **Visual Studio Copilot** and **VSCode Copilot Chat** to interact with third-party APIs through a simulated Ollama endpoint.

> This project is based on [o2lma](https://github.com/wrtx-dev/o2lma), a CLI proxy by [wrtx-dev](https://github.com/wrtx-dev). vs2lma adds a Windows system tray GUI, configuration management, connection testing, and request monitoring on top of the original proxy engine.

## Features

- **API Compatibility**: Converts DeepSeek/OpenAI-style requests to Ollama-compatible requests
- **System Tray**: Runs silently in the Windows notification area with a right-click menu
- **Configuration UI**: Fill in API URL, key, port, and capabilities through a clean desktop window
- **Connection Testing**: Test your API credentials before starting the server
- **Real-time Monitoring**: Dashboard shows uptime, request count, and a live request log
- **Bilingual**: Supports English and Chinese, auto-detected from system language
- **CLI Mode**: Still works as a CLI tool — `npx vs2lma --apikey sk-...`

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri, the desktop wrapper)

### Build from source

```bash
git clone https://github.com/wrtx-dev/vs2lma.git
cd vs2lma
npm install
npm run build
npm run tauri dev      # Run in development mode
npm run tauri build    # Package as Windows installer
```

### Running in CLI mode

```bash
npm install
npm run build
node dist/index.js --url https://api.deepseek.com --apikey sk-xxx --port 11434
```

## Configuration

Configure the server through the desktop UI (Configuration tab) or via command-line arguments / environment variables:

### Command-line options

```bash
npx vs2lma --url [API_BASE_URL] --apikey [API_KEY] --host [HOST] --port [PORT] --cap [CAPABILITIES]
```

Options:

- `--url`: Base API URL (default: https://api.deepseek.com)
- `--apikey`: API key for authentication
- `--host`: Server host (default: localhost)
- `--port`: Server port (default: 11434)
- `--cap`: Additional capabilities (options: tools, thinking)

### Environment variables

```bash
export BASE_URL="https://api.deepseek.com"
export API_KEY="your-api-key"
```

## Usage

1. Launch **vs2lma** from the Start Menu or by running `npm run tauri dev`
2. Fill in your **API Key** and **Base URL** in the Configuration tab, click **Save Config**
3. Click **Test Connection** to verify your credentials
4. Click **Start Server** — the proxy starts on `http://localhost:11434`
5. Configure your client (Visual Studio, VSCode Copilot) to use `http://localhost:11434` as the Ollama endpoint
6. Monitor requests in the Dashboard tab

## API Endpoints

The server provides Ollama-compatible endpoints:

- `GET /api/version` — Returns server version
- `POST /api/show` — Returns model capabilities
- `GET /api/tags` — Lists available models
- `POST /v1/chat/completions` — Proxies chat completion requests

## Credits

- Proxy engine based on [o2lma](https://github.com/wrtx-dev/o2lma) by [wrtx-dev](https://github.com/wrtx-dev)
- Desktop wrapper built with [Tauri](https://tauri.app/)
- Server framework: [Hono](https://hono.dev/)

## License

[MIT](https://choosealicense.com/licenses/mit/)

![](assets/ui.png)