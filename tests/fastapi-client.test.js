import { describe, expect, it, vi } from 'vitest';
import { createFastApiClient, normalizeFastApiResult } from '../src/api/fastapi-client.js';

describe('direct FastAPI client', () => {
  it('maps the supplied object response into a task record', () => {
    const task = normalizeFastApiResult({
      image_size: { width: 640, height: 640 },
      num_objects: 3,
      inference_time_ms: 743,
      objects: [{ class_name: 'plastic', confidence: 0.87, bbox_xyxy: [1, 2, 3, 4], area_px: 12, area_ratio: 0.0121, sam_score: 0.98 }],
    }, { id: 'FASTAPI-1', image: '/tmp/river.jpg' });

    expect(task).toMatchObject({
      id: 'FASTAPI-1',
      category: 'plastic',
      sourceCategory: 'plastic',
      confidence: 0.87,
      count: 3,
      coverage: '1.2%',
      inferenceTimeMs: 743,
      bbox: [1, 2, 3, 4],
      samScore: 0.98,
    });
    expect(task.objects).toHaveLength(1);
  });

  it('posts the configured multipart field to the supplied FastAPI path', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ num_objects: 0, objects: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const bootstrapClient = {
      getBootstrap: vi.fn().mockResolvedValue({ riverSegments: [{ id: 'SEG-01', name: 'East' }], integrations: [] }),
    };
    const client = createFastApiClient({
      baseUrl: 'https://10776c44.r21.cpolar.top',
      processPath: '/process',
      fileField: 'upload',
      fetcher,
      bootstrapClient,
    });
    const image = new File(['river'], 'river.jpg', { type: 'image/jpeg' });

    const task = await client.createTask({ image, riverSegmentId: 'SEG-01', capturedAt: '2026-09-02T08:30', latitude: 30, longitude: 120 });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://10776c44.r21.cpolar.top/process');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('upload')).toBe(image);
    expect(task.segmentName).toBe('East');
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('normalizes non-json FastAPI errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('bad image', { status: 422 }));
    const client = createFastApiClient({ fetcher, bootstrapClient: { getBootstrap: vi.fn() } });
    await expect(client.createTask({ image: new File(['x'], 'x.jpg') })).rejects.toMatchObject({ status: 422, code: 'FASTAPI_HTTP_ERROR' });
  });
});
