import { describe, expect, it, vi } from 'vitest';
import { createPlatformClient, PlatformApiError } from '../src/api/client.js';

describe('platform API client', () => {
  it('uploads one report through the local FastAPI boundary without exposing an upstream API key', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'TASK-2409' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createPlatformClient({ baseUrl: '/api', fetcher });
    const payload = {
      image: new File(['river'], 'river.jpg', { type: 'image/jpeg' }),
      riverSegmentId: 'SEG-01',
      capturedAt: '2026-09-02T08:30',
      latitude: 30.2741,
      longitude: 120.1551,
      locationChangeReason: '',
    };

    await expect(client.createTask(payload)).resolves.toEqual({ id: 'TASK-2409' });

    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/tasks');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(options.headers).not.toHaveProperty('X-API-Key');
    expect(options.body.get('river_segment_id')).toBe('SEG-01');
    expect(options.body.get('captured_at')).toBe('2026-09-02T08:30');
  });

  it('normalizes structured FastAPI errors for the interface', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: 'IMAGE_TOO_LARGE', message: '图片不能超过 10 MB' } }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createPlatformClient({ baseUrl: '/api', fetcher });

    await expect(client.getTasks()).rejects.toMatchObject({
      name: PlatformApiError.name,
      status: 413,
      code: 'IMAGE_TOO_LARGE',
      message: '图片不能超过 10 MB',
    });
  });
});
