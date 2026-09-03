import http from 'node:http';

const DEFAULT_UPSTREAM = 'https://api.benefitgpt.top/v1';
const DEFAULT_MODEL = 'gpt-5.5';
const MAX_BODY_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;

function json(res, status, body, origin = '*') {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('请求体过大'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('请求体不是有效 JSON'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function allowedOrigin(requestOrigin, configuredOrigins) {
  if (!requestOrigin) return '*';
  const origins = configuredOrigins.split(',').map((item) => item.trim()).filter(Boolean);
  return origins.includes(requestOrigin) ? requestOrigin : origins[0] || '*';
}

function upstreamError(status, body) {
  const detail = typeof body?.error?.message === 'string'
    ? body.error.message
    : typeof body?.detail === 'string' ? body.detail : '上游大模型请求失败';
  return { status, detail, code: 'UPSTREAM_LLM_ERROR' };
}

export function createLlmProxy({
  upstreamBaseUrl = process.env.LLM_BASE_URL || DEFAULT_UPSTREAM,
  apiKey = process.env.LLM_API_KEY || '',
  model = process.env.LLM_MODEL || DEFAULT_MODEL,
  allowedOrigins = process.env.LLM_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175',
  fetcher = globalThis.fetch,
} = {}) {
  const upstreamUrl = `${upstreamBaseUrl.replace(/\/$/, '')}/chat/completions`;

  async function analyze(input) {
    if (!apiKey) {
      throw Object.assign(new Error('服务端未配置 LLM_API_KEY'), { status: 500, code: 'MISSING_LLM_API_KEY' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(upstreamUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: '你是河道垃圾处置研判助手。只根据用户提供的结构化检测数据输出 JSON，不要编造未提供的事实。字段必须包含 unified_category、risk、priority、summary、recommendation。',
            },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json() : { detail: await response.text() };
      if (!response.ok) throw Object.assign(new Error(upstreamError(response.status, body).detail), upstreamError(response.status, body));
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handler(req, res) {
    const origin = allowedOrigin(req.headers.origin, allowedOrigins);
    if (req.method === 'OPTIONS') return json(res, 204, {}, origin);
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, model }, origin);
    if (req.method !== 'POST' || req.url !== '/api/llm/analyze') return json(res, 404, { detail: 'Not found' }, origin);

    try {
      const input = await readJson(req);
      const result = await analyze(input);
      return json(res, 200, result, origin);
    } catch (error) {
      if (error.code === 'BODY_TOO_LARGE') return json(res, 413, { detail: error.message, code: error.code }, origin);
      if (error.code === 'INVALID_JSON') return json(res, 400, { detail: error.message, code: error.code }, origin);
      if (error.name === 'AbortError') return json(res, 504, { detail: '大模型请求超时', code: 'UPSTREAM_TIMEOUT' }, origin);
      return json(res, error.status || 502, { detail: error.message || '大模型代理失败', code: error.code || 'LLM_PROXY_ERROR' }, origin);
    }
  }

  return { handler, analyze, config: { upstreamUrl, model } };
}

export function startLlmProxy({ host = process.env.LLM_PROXY_HOST || '127.0.0.1', port = Number(process.env.LLM_PROXY_PORT || 8787), ...options } = {}) {
  const proxy = createLlmProxy(options);
  const server = http.createServer(proxy.handler);
  server.listen(port, host, () => {
    console.log(`LLM proxy listening on http://${host}:${port}`);
  });
  return server;
}
