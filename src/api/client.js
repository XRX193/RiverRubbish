export class PlatformApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN_ERROR', details = null } = {}) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const detail = data?.detail;
    throw new PlatformApiError(
      typeof detail === 'string' ? detail : detail?.message || '平台接口请求失败',
      {
        status: response.status,
        code: detail?.code || data?.code || 'HTTP_ERROR',
        details: detail,
      },
    );
  }

  return data;
}

export function createPlatformClient({ baseUrl = '/api', fetcher = globalThis.fetch } = {}) {
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetcher(joinUrl(baseUrl, path), {
        credentials: 'include',
        headers: {},
        ...options,
      });
    } catch (error) {
      throw new PlatformApiError('无法连接平台服务，请稍后重试', {
        code: 'NETWORK_ERROR',
        details: error,
      });
    }
    return parseResponse(response);
  }

  return {
    async getBootstrap() {
      const [currentUser, tasks, riverSegments, orders, statistics, users, integrations] = await Promise.all([
        request('/me'),
        request('/tasks'),
        request('/segments'),
        request('/orders'),
        request('/statistics'),
        request('/users'),
        request('/system/integrations'),
      ]);
      return { currentUser, tasks, riverSegments, orders, users, integrations, ...statistics };
    },

    getTasks(params = {}) {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== '' && value != null),
      );
      const suffix = query.size ? `?${query}` : '';
      return request(`/tasks${suffix}`);
    },

    createTask(payload) {
      const form = new FormData();
      form.set('file', payload.image);
      form.set('river_segment_id', payload.riverSegmentId);
      form.set('captured_at', payload.capturedAt);
      if (payload.latitude != null) form.set('latitude', String(payload.latitude));
      if (payload.longitude != null) form.set('longitude', String(payload.longitude));
      if (payload.locationChangeReason) {
        form.set('location_change_reason', payload.locationChangeReason);
      }
      return request('/tasks', { method: 'POST', body: form });
    },

    reviewTask(taskId, payload) {
      return request(`/tasks/${encodeURIComponent(taskId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },

    assignOrder(orderId, payload) {
      return request(`/orders/${encodeURIComponent(orderId)}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },

    retryTask(taskId, stage) {
      return request(`/tasks/${encodeURIComponent(taskId)}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
    },

    cancelTask(taskId, reason) {
      return request(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    },

    startOrder(orderId) {
      return request(`/orders/${encodeURIComponent(orderId)}/start`, { method: 'POST' });
    },

    submitEvidence(orderId, payload) {
      const form = new FormData();
      form.set('file', payload.image);
      form.set('completed_at', payload.completedAt);
      return request(`/orders/${encodeURIComponent(orderId)}/evidence`, { method: 'POST', body: form });
    },

    verifyOrder(orderId, payload) {
      return request(`/orders/${encodeURIComponent(orderId)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },

    getMapPoints(params = {}) {
      const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null));
      return request(`/map/points${query.size ? `?${query}` : ''}`);
    },

    exportTasksCsv(params = {}) {
      const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null));
      return request(`/exports/tasks.csv${query.size ? `?${query}` : ''}`);
    },

    testIntegration() {
      return request('/system/integrations/test', { method: 'POST' });
    },
  };
}
