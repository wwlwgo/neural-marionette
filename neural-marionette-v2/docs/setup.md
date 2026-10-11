# 安装与启动

## 本次交付机器

依赖、模型与 WASM 已准备好。最少操作：

1. 在 Finder 打开本项目目录。
2. 双击「启动数字提线木偶.command」。它会启动仅监听本机的服务，并在 Google Chrome 打开项目；如果本项目已运行，会直接复用地址。
3. 点击页面「开启摄像头」。在浏览器提示中允许摄像头访问。
4. 把一只张开的手放到左侧取景区，稳定保持约半秒。五条线点亮后，缓慢移动手掌和手指。
5. 点击「录制 25 秒」。25 秒后自动下载视频，也可以提前点击「停止并保存」。不录制声音。
6. 结束时点击「关闭摄像头」。关闭服务终端或按 Control+C 可停止本地服务器。

Mac 若阻止直接运行 .command，可使用下方终端命令启动；不要关闭系统安全保护。

## 命令行启动

在本目录的终端运行：

```sh
npm run dev -- --port 5173 --strictPort
```

打开 http://127.0.0.1:5173 。不能双击 index.html 使用 file://，因为摄像头、Worker 与模块加载需要正确 HTTP 源。

## 新电脑或全新安装

前置条件：Node.js 22.12+，桌面 Chrome，支持 WebGL2 的 GPU。系统运行不需要 Python、Blender 或 TouchDesigner。

```sh
npm ci
npm run assets
npm test
npm run build
npm run preview -- --port 5173 --strictPort
```

npm ci 使用 package-lock.json 的锁定依赖。npm run assets 复制相同版本的 WASM 与 CJS bundle，从 Google 官方模型库取模型，并写入 SHA256 清单。首次安装需要联网；准备好后运行不依赖外部网络。已有模型会被复用，不自动替换。

## 摄像头设备与权限

- 正常浏览器使用当前默认摄像头。可在 Chrome 设置 → 隐私和安全 → 网站设置 → 摄像头中选择设备。
- 系统设置 → 隐私与安全性 → 摄像头 → 开启 Google Chrome。
- 重新加载页面并点击连接。如果刚切换设备，可先断开再连接。
- 需要固定设备时，可将浏览器枚举出的 deviceId 填入 config/app_config.json 的 camera.device_id；不使用易变的数字索引。
- 麦克风始终禁用。录像与诊断下载均留在本机。

## 安装后验证

npm test 应全部通过。浏览器初始显示完整三维机器人；模拟操控显示 SIMULATION 与 21/21，移动鼠标能连续驱动整体。

真人验收则必须在 LIVE CAMERA 下进行，不能以模拟模式代替。建议先以均衡 1080p 测试，若卡顿选择轻量 720p。

## 浏览器自动测试（开发者）

本次系统 Python 3.9 的测试依赖位于 .test-python。测试时另一个终端保持本地服务器运行：

```sh
PYTHONPATH=.test-python /usr/bin/python3 tests/browser_test.py
PYTHONPATH=.test-python /usr/bin/python3 tests/model_test.py
PYTHONPATH=.test-python /usr/bin/python3 tests/soak_test.py
```

新电脑需自行安装 Python Playwright，并将脚本中的 CHROME 路径改为本机 Chrome for Testing。测试脚本明确使用假摄像头；model_test 使用官方静态手部图片；soak_test 的 600 秒是实际时钟时间。
