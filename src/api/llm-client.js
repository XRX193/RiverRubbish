import { PlatformApiError } from './client.js';

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function parseStructuredContent(content) {
  if (typeof content !== 'string') return content || {};
  try {
    return JSON.parse(content);
  } catch {
    return { summary: content };
  }
}

function normalizeModelResult(data) {
  const payload = data?.result ?? data?.data ?? data ?? {};
  const choiceContent = payload.choices?.[0]?.message?.content;
  const result = parseStructuredContent(choiceContent ?? payload);
  return {
    modelCategory: result.unified_category || result.category || result.class_name || '',
    modelRisk: result.risk || result.risk_level || '',
    modelPriority: result.priority || result.priority_level || '',
    modelSummary: result.summary || result.analysis || '',
    modelRecommendation: result.recommendation || result.disposal_advice || '',
    modelRaw: result,
  };
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = { detail: '大模型服务返回了无效 JSON' };
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
      typeof detail === 'string' ? detail : detail?.message || data?.message || '大模型服务请求失败',
      { status: response.status, code: detail?.code || data?.code || 'LLM_HTTP_ERROR', details: detail || data },
    );
  }
  return data;
}

function toAnalysisPayload(task) {
  return {
    task_id: task.id,
    river_segment: task.segmentName,
    captured_at: task.capturedAt,
    location: { latitude: task.lat, longitude: task.lng, description: task.location },
    source_category: task.sourceCategory,
    detections: (task.objects || []).map((item) => ({
      class_name: item.class_name,
      confidence: item.confidence,
      bbox_xyxy: item.bbox_xyxy,
      area_px: item.area_px,
      area_ratio: item.area_ratio,
      sam_score: item.sam_score,
    })),
    num_objects: task.count,
    coverage: task.coverage,
  };
}

/**
 * Browser-side adapter for the server proxy that owns the BenefitGPT key.
 * It intentionally sends structured detections only; original images and keys stay out of this request.
 */
export function createLlmClient({ baseUrl = '/api', analyzePath = '/llm/analyze', fetcher = globalThis.fetch } = {}) {
  async function analyzeRecognition(task) {
    let response;
    try {
      response = await fetcher(joinUrl(baseUrl, analyzePath), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toAnalysisPayload(task)),
      });
    } catch (error) {
      throw new PlatformApiError('无法连接大模型服务代理，请检查平台 API', { code: 'NETWORK_ERROR', details: error });
    }
    return normalizeModelResult(await parseResponse(response));
  }

  return { analyzeRecognition };
}

export { normalizeModelResult, toAnalysisPayload };
