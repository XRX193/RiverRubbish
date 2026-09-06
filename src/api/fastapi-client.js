import { PlatformApiError } from './client.js';
import { createMockClient } from './mock-client.js';

const DEFAULT_BASE_URL = 'https://10776c44.r21.cpolar.top';
const DEFAULT_PROCESS_PATH = '/process';
const DEFAULT_FILE_FIELD = 'file';
const mockBootstrapClient = createMockClient();
const defaultBootstrapClient = { getBootstrap: () => mockBootstrapClient.getBootstrap() };

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function objectUrl(file) {
  return typeof URL?.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
}

function formatCoverage(areaRatio) {
  const ratio = numberOrNull(areaRatio);
  return ratio == null ? '0%' : `${(ratio * 100).toFixed(1)}%`;
}

function riskFor(objects, confidence) {
  const hasHazardousClass = objects.some((item) => /chemical|hazard|battery|oil|sharp/i.test(String(item.class_name || '')));
  if (hasHazardousClass || confidence >= 0.9) return '高';
  if (confidence >= 0.65) return '中';
  return '低';
}

/**
 * Convert the supplied detector contract into the task shape used by the UI.
 * Unknown fields are preserved so a later detail view can inspect raw metrics.
 */
export function normalizeFastApiResult(data, { id = `FASTAPI-${Date.now()}`, image = '' } = {}) {
  const payload = data?.result ?? data?.data ?? data ?? {};
  const annotatedSrc = payload.annotated_image_b64
    ? `data:image/jpeg;base64,${payload.annotated_image_b64}`
    : '';
  const objects = Array.isArray(payload.objects) ? payload.objects : [];
  const confidence = objects.length
    ? Math.max(...objects.map((item) => numberOrNull(item.confidence) ?? 0))
    : numberOrNull(payload.confidence) ?? 0;
  const firstObject = objects[0] || {};
  const totalAreaRatio = objects.reduce((sum, item) => sum + (numberOrNull(item.area_ratio) || 0), 0);
  const category = firstObject.class_name || '未分类';

  return {
    id,
    segmentId: null,
    segmentName: '待补充河段',
    location: '识别服务返回结果',
    category,
    sourceCategory: category,
    confidence,
    risk: riskFor(objects, confidence),
    priority: confidence >= 0.9 ? '紧急' : confidence >= 0.65 ? '高' : '普通',
    status: '待核查',
    stage: '人工复核',
    reporter: '当前用户',
    capturedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    updatedAt: '刚刚',
    lat: null,
    lng: null,
    count: numberOrNull(payload.num_objects) ?? objects.length,
    coverage: formatCoverage(totalAreaRatio),
    duplicate: false,
    due: '待核查后确定',
    summary: `FastAPI 识别到 ${numberOrNull(payload.num_objects) ?? objects.length} 个目标，最高置信度 ${(confidence * 100).toFixed(1)}%。`,
    recommendation: '请结合现场情况完成业务复核，再决定是否派出处置任务。',
    image: image || annotatedSrc,
    inferenceTimeMs: numberOrNull(payload.inference_time_ms),
    imageSize: payload.image_size || null,
    objects,
    bbox: firstObject.bbox_xyxy || null,
    areaPx: numberOrNull(firstObject.area_px),
    samScore: numberOrNull(firstObject.sam_score),
    rawRecognition: payload,
  };
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = { detail: 'FastAPI 返回了无效 JSON' };
    }
  } else {
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text ? { detail: text } : null;
    }
  }

  if (!response.ok) {
    const detail = data?.detail;
    throw new PlatformApiError(
      typeof detail === 'string' ? detail : detail?.message || data?.message || 'FastAPI 请求失败',
      { status: response.status, code: detail?.code || data?.code || 'FASTAPI_HTTP_ERROR', details: detail || data },
    );
  }
  return data;
}

export function createFastApiClient({
  baseUrl = DEFAULT_BASE_URL,
  processPath = DEFAULT_PROCESS_PATH,
  fileField = DEFAULT_FILE_FIELD,
  healthPath = '/health',
  fetcher = globalThis.fetch,
  bootstrapClient = defaultBootstrapClient,
  apiKey = '',
  apiKeyHeader = 'Authorization',
} = {}) {
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (apiKey) headers[apiKeyHeader] = apiKeyHeader.toLowerCase() === 'authorization' ? `Bearer ${apiKey}` : apiKey;
    let response;
    try {
      response = await fetcher(joinUrl(baseUrl, path), { ...options, headers });
    } catch (error) {
      throw new PlatformApiError('无法连接 FastAPI 识别服务，请检查地址或跨域配置', { code: 'NETWORK_ERROR', details: error });
    }
    return parseResponse(response);
  }

  return {
    async getBootstrap() {
      const data = await bootstrapClient.getBootstrap();
      const integrations = Array.isArray(data.integrations) ? data.integrations : [];
      return {
        ...data,
        integrations: integrations.map((item) => item.name.includes('识别')
          ? { ...item, detail: `${processPath} · 直接浏览器接入`, status: '正常' }
          : item),
      };
    },

    async createTask(payload) {
      const form = new FormData();
      form.set(fileField, payload.image);
      if (payload.riverSegmentId) form.set('river_segment_id', payload.riverSegmentId);
      if (payload.capturedAt) form.set('captured_at', payload.capturedAt);
      if (payload.latitude != null) form.set('latitude', String(payload.latitude));
      if (payload.longitude != null) form.set('longitude', String(payload.longitude));
      const result = await request(processPath, { method: 'POST', body: form });
      const responseData = result?.result ?? result?.data ?? result;
      const annotatedSrc = responseData?.annotated_image_b64
        ? `data:image/jpeg;base64,${responseData.annotated_image_b64}`
        : '';
      const task = normalizeFastApiResult(result, { image: annotatedSrc || objectUrl(payload.image) });
      const bootstrap = await bootstrapClient.getBootstrap();
      const segment = (bootstrap.riverSegments || []).find((item) => item.id === payload.riverSegmentId);
      if (segment) {
        task.segmentId = segment.id;
        task.segmentName = segment.name;
      }
      task.capturedAt = payload.capturedAt || task.capturedAt;
      task.lat = payload.latitude;
      task.lng = payload.longitude;
      return task;
    },

    async testIntegration() {
      const started = performance.now();
      await request(healthPath, { method: 'GET' });
      return { ok: true, latency: Math.round(performance.now() - started) };
    },

    reviewTask() { return Promise.resolve({}); },
    assignOrder() { return Promise.resolve({}); },
  };
}

export { DEFAULT_BASE_URL, DEFAULT_FILE_FIELD, DEFAULT_PROCESS_PATH };
