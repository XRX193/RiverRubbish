import { describe, expect, it, vi } from 'vitest';
import { createLlmClient, normalizeModelResult, toAnalysisPayload } from '../src/api/llm-client.js';

const task = {
  id: 'FASTAPI-1',
  segmentName: 'East',
  capturedAt: '2026-09-02T08:30',
  lat: 30,
  lng: 120,
  location: 'bridge',
  sourceCategory: 'plastic',
  count: 1,
  coverage: '1.2%',
  objects: [{ class_name: 'plastic', confidence: 0.87, bbox_xyxy: [1, 2, 3, 4], area_px: 12, area_ratio: 0.012, sam_score: 0.98 }],
};

describe('BenefitGPT frontend proxy client', () => {
  it('sends structured detections only and never an API key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      unified_category: '塑料制品', risk: '高', priority: '紧急', summary: '发现塑料垃圾', recommendation: '立即清理',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createLlmClient({ baseUrl: '/api', analyzePath: '/llm/analyze', fetcher });

    await expect(client.analyzeRecognition(task)).resolves.toMatchObject({
      modelCategory: '塑料制品', modelRisk: '高', modelPriority: '紧急', modelSummary: '发现塑料垃圾',
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/llm/analyze');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual(expect.objectContaining({ task_id: 'FASTAPI-1', source_category: 'plastic' }));
    expect(options.body).not.toContain('sk-');
  });

  it('reads OpenAI-compatible message content', () => {
    expect(normalizeModelResult({ choices: [{ message: { content: '{"category":"plastic","risk":"中"}' } }] })).toMatchObject({
      modelCategory: 'plastic', modelRisk: '中',
    });
    expect(toAnalysisPayload(task).detections[0]).not.toHaveProperty('image');
  });
});
