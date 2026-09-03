import { describe, expect, it, vi } from 'vitest';
import { createLlmProxy } from '../server/llm-proxy.js';

describe('server LLM proxy', () => {
  it('keeps the server key in the upstream authorization header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"unified_category":"plastic"}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const proxy = createLlmProxy({ apiKey: 'server-test-key', model: 'gpt-5.5', fetcher });

    const response = await proxy.analyze({ task_id: 'TASK-1', detections: [] });
    expect(response.choices[0].message.content).toContain('plastic');
    const [, options] = fetcher.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer server-test-key');
    expect(JSON.parse(options.body)).toMatchObject({ model: 'gpt-5.5', temperature: 0.1 });
  });

  it('fails closed when the server key is missing', async () => {
    const proxy = createLlmProxy({ apiKey: '', fetcher: vi.fn() });
    await expect(proxy.analyze({ task_id: 'TASK-1' })).rejects.toMatchObject({ code: 'MISSING_LLM_API_KEY', status: 500 });
  });
});
