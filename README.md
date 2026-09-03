# 清川 · 河道垃圾智能处置平台前端

基于 `河道垃圾智能处置平台设计方案.md` 实现的原生 JavaScript 管理工作台。首屏为可直接操作的调度总览，包含上报、任务查询、处置闭环、地图、统计和系统管理视图。

## 本地运行

```bash
npm install
npm run dev
```

另开一个终端启动大模型代理：

```bash
npm run server
```

代理监听 `127.0.0.1:8787`，Vite 会把前端的 `/api/llm/analyze` 转发到该服务。启动代理前，在服务端进程环境设置新的 `LLM_API_KEY`；不要把它写入前端 `.env`、源码或 Git。

默认直接连接你提供的识别 FastAPI。创建 `.env.local` 并填写需要暴露给浏览器的 `VITE_*` 变量，可通过 `VITE_FASTAPI_BASE_URL`、`VITE_FASTAPI_PROCESS_PATH` 和 `VITE_FASTAPI_FILE_FIELD` 覆盖服务地址、POST 路径和图片字段。`FASTAPI_*`、`LLM_*` 等服务端变量不要放入 `.env.local`；它们只在启动服务端代理或 Worker 的进程环境中配置。设置 `VITE_API_MODE=mock` 可切回演示数据，设置为 `api` 则使用平台 `/api` 边界。

识别上报会向 `${VITE_FASTAPI_BASE_URL}${VITE_FASTAPI_PROCESS_PATH}` 发送 `multipart/form-data`，默认字段名为 `file`，并把返回的 `objects`、置信度、框坐标、面积、SAM 分数和推理耗时写入新任务详情。直接浏览器接入要求该 FastAPI 开启 CORS；若部署环境不允许跨域，使用 `api` 模式并由服务端转发。

识别完成后，前端默认向同源 `${VITE_LLM_PROXY_BASE_URL}${VITE_LLM_ANALYZE_PATH}` 发送仅含结构化检测数据的 JSON，请平台后端使用 `LLM_BASE_URL=https://api.benefitgpt.top/v1`、`LLM_MODEL=gpt-5.5` 调用 BenefitGPT，并返回统一类别、风险、优先级、摘要和处置建议。BenefitGPT 的 `LLM_API_KEY` 只放在服务端环境，绝不能写入前端；将 `VITE_LLM_MODE=off` 可关闭大模型研判，不会影响图片识别。

## 高德地图

在高德开放平台创建 Web 端（JS API）应用，配置 Key 的安全设置（推荐使用允许的域名白名单），并复制到 `.env.local`：

```env
VITE_MAP_PROVIDER=amap
VITE_AMAP_KEY=你的高德Web端Key
VITE_AMAP_SECURITY_CODE=你的安全密钥（如控制台要求）
```

任务列表、调度队列中的任务点击后会跳转到“河道地图”，自动居中并打开对应点位；地图弹窗仍可进入任务详情。高德脚本、Key 或安全配置不可用时自动回退 Leaflet。高德 Web 端 Key 会出现在浏览器请求中，必须配置域名白名单，不能把服务端 LLM/API 密钥当作地图 Key 使用。

## FastAPI 与 API Key 接入边界

浏览器只调用平台 FastAPI 的 `/api/*` 接口，并依赖 `HttpOnly` Cookie 会话。远程识别服务的 `FASTAPI_API_KEY` 和 Sub2 的 `LLM_API_KEY` 必须只存在于 FastAPI/Worker 的服务器环境，不能使用 `VITE_` 前缀，也不能返回给浏览器。

已预留的浏览器端接口集中在 `src/api/client.js`。上传使用 `multipart/form-data`，字段与设计方案保持一致；接口错误会规整为 `PlatformApiError`。切换真实后端不需要修改页面组件。

## 检查

```bash
npm run typecheck
npm test
npm run build
```

## 图像来源

任务示例照片的署名与许可见 `public/assets/ATTRIBUTION.md`。
