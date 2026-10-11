# 架构与坐标

## 模块职责

| 文件 | 职责 |
| --- | --- |
| config/app_config.json | 摄像头、追踪、响应、输出、录制默认值 |
| config/landmark_to_bone.json | 五条线的具名手部输入、骨骼、颜色与标签 |
| public/tracker.worker.js | 独立 classic Worker，加载本地 MediaPipe WASM，CPU 推理 |
| src/core.js | 数据有效性、坐标变换、时间滤波、状态、中立姿态与连续映射 |
| src/robot.js | Bone 层级、刚性机械外壳、材质、灯光、世界/屏幕投影 |
| src/main.js | 摄像头生命周期、Worker 背压、合成、参数面板、录像与诊断 |
| src/style.css | 响应式实验台界面 |

没有后端推理服务、LLM、账号或外部控制端口。服务默认仅绑定 127.0.0.1。

## 数据流

视频只在 video.currentTime 变化时处理。最多一个 ImageBitmap 推理任务在途，不排队积累延迟。采样缩小到 640 像素宽，按视频本身宽高比缩放。Worker 返回 landmarks、handedness、输入派发时间戳和实际推理耗时。

MediaPipe 的 detectForVideo 是同步调用，所以放在 Worker。0.10.32 的发布包为 CJS/MJS；本项目使用 classic Worker 和一个 exports 对象承接 CJS，以兼容 WASM 加载器的 importScripts。生产和开发均使用 /vendor/vision_bundle.js 与 /wasm/，不走 CDN。

CPU delegate 避免 Worker 中 GPU 上下文实现差异。本机测试性能记录在 evidence，不能据此假定所有机器均够用。

## 坐标定义

1. 原始输入是相机未镜像图像的归一化 XYZ。x 向右、y 向下，z 相对腕点，第一版不用其作为米制距离。
2. 显示镜像只在两个明确入口执行：screenPoint 的 x → 1-x；calibration/mapPose 的 x → 1-x。相机绘制执行同样水平翻转，模型输入本身不翻转。
3. 视频取景框使用 containRect 等比留边。关键点投影使用实际视频矩形而不是包含黑边的外框，防止宽高比变化后错位。
4. 手掌局部：指尖减腕点，再除以腕点到中指掌指关节的归一化距离；做下限保护。中立参考来自稳定样本平均。
5. 世界坐标：机器人单位为造型单位，不宣称真实米制。Root 带动整个人偶，Chest 带动头与双臂。
6. 机器人连接点：Bone 本地表面偏移 → localToWorld → 当前透视相机 project → 1920×1080 或 1280×720 合成坐标。
7. 摄像头、机器人与所有线直接画入同一个输出 canvas。CSS 只整体缩放画布，因此窗口缩放不会让两层分别漂移。

五条线使用三次 Bézier；起点为具名 Landmark，末端为机器人表面的锚点（不是不可见的骨骼中心），因此视觉上贴合外壳。微小几何偏移用于让能量点显示在外壳表面；没有用屏幕神秘常数追着模型移动。

## 控制与状态

Searching → Acquiring（连续有效点）→ Linked / Controlling。短暂缺帧 250 ms 内保留连接；超过窗口进入 Lost，逐渐淡出、回中立；再回到 Searching。长时间无数据则进入 Error 并释放摄像头，防止最后一帧假装仍在工作。

重新入镜后清空滤波与校准参考，重新建立连接。模式切换用 generation 标记隔离旧的异步结果，避免旧 Worker 或迟到的 getUserMedia 覆盖当前模式。

旋转映射使用归一化相对位移、死区、增益和角度夹紧，随后用按 dt 的指数响应与最大速度限制。没有把图像坐标直接作为欧拉角，也没有离散手势触发预置动画。

## 录制

canvas.captureStream → MediaRecorder。只捕获最终输出画布，无音轨、无外部上传。25 秒自动停止；下载名与画布同时区分 SIMULATION / LIVE。模式切换、页面进入后台都会结束当前录像并停止摄像头。

## 性能指标的含义

- 渲染 FPS：最近一秒内完成渲染的帧数。
- 推理 ms：Worker 内 detectForVideo 耗时。
- 追踪 Hz：最近一秒收到的推理结果数，包含无手结果。
- 左右手分类 %：handedness score，不是关键点置信度。
- 诊断报告：滚动保存约 18 分钟采样；报告区分来源模式。端到端延迟仍需外部高速摄影测量。

## 资产

机器人是本项目生成的刚性机械外壳，节点直接挂在 Bone 上。Skeleton 实例记录骨骼集合；没有柔性蒙皮变形。头部、胸部、骨盆和双臂均可独立控制。全场约 22,540 三角形、59 draw calls（初版测量）。
