# 来源与许可记录

## 本项目机械机器人

src/robot.js 内的机械外壳和骨骼层级为本项目自制，无下载的第三方角色。可随项目用于个人展示、修改及录制；未模仿指定影视 IP。几何由 Three.js 基础体与 RoundedBoxGeometry 生成。

## 运行依赖

- Three.js 0.180.0：MIT，https://github.com/mrdoob/three.js ，完整许可随 node_modules/three/LICENSE 提供，并复制到本目录 THREE-LICENSE.txt。
- @mediapipe/tasks-vision 0.10.32：Apache-2.0（npm 包声明），https://github.com/google-ai-edge/mediapipe 。本地复制的 bundle/WASM 来自此锁定 npm 包。
- Vite 7.3.6：MIT，仅开发与构建工具。

## 手部模型

Google 官方 MediaPipe 模型，下载地址及 SHA256 见 model-manifest.json。

模型官方入口：https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#models

模型为 Google 提供的预训练资源，第三方分发/商业使用前应遵循其官方资源条款；本项目不将其改称自制或 CC0。

## 测试图片

公开仓库不附带 tests/fixtures/right_hands.jpg。需要运行静态图片测试时可自行准备；原测试夹具来自 Google MediaPipe 官方资源：
https://storage.googleapis.com/mediapipe-assets/right_hands.jpg

仅作为自动测试夹具，未用作实时摄像头伪装或产品视觉资产。测试结果明确注明静态图片。

## 字体与影像

界面使用系统字体，不打包商业字体文件。没有外部视频或库存影像。公开仓库不包含参考视频、演示录像或摄像头截图，只保留摄像头关闭状态的一张项目截图。

## 原创项目配乐

Neon Orbit · 霓光轨道由本项目的 `scripts/compose-music.mjs` 编排与合成，未使用第三方歌曲、录音或采样。MP3 位于 `public/music/neon-orbit.mp3`；合成脚本和参数随仓库提供，播放无需外部音乐服务。项目级许可状态见仓库根 README。
