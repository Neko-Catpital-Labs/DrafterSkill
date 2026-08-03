import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = join(packageRoot, 'dist', 'index.js');

/** Spawns the real built stdio server and exchanges real JSON-RPC messages — a black-box test, not reaching into SDK internals. */
async function withServer(fn: (send: (msg: unknown) => void, readNext: () => Promise<unknown>) => Promise<void>): Promise<void> {
  const child = spawn('node', [distEntry], { stdio: ['pipe', 'pipe', 'pipe'] });
  const messages: unknown[] = [];
  const waiters: ((msg: unknown) => void)[] = [];
  let buffer = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter(parsed);
      else messages.push(parsed);
    }
  });

  const send = (msg: unknown) => child.stdin.write(JSON.stringify(msg) + '\n');
  const readNext = () =>
    new Promise((resolve) => {
      const queued = messages.shift();
      if (queued !== undefined) resolve(queued);
      else waiters.push(resolve);
    });

  try {
    await fn(send, readNext);
  } finally {
    child.kill();
  }
}

describe('drafter-mcp stdio server (black-box)', () => {
  it('lists all six tools and the clarify-scope prompt', async () => {
    await withServer(async (send, readNext) => {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.0.1' } } });
      await readNext();
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      const toolsResponse = (await readNext()) as { result: { tools: { name: string }[] } };
      expect(toolsResponse.result.tools.map((t) => t.name).sort()).toEqual([
        'classify_review_scope',
        'draft_pr_body',
        'lint_diff_atomicity',
        'propose_safety_invariant',
        'render_pr_body_template',
        'validate_pr_body',
      ]);

      send({ jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} });
      const promptsResponse = (await readNext()) as { result: { prompts: { name: string }[] } };
      expect(promptsResponse.result.prompts.map((p) => p.name)).toEqual(['drafter-clarify-scope']);
    });
  }, 10000);

  it('calling classify_review_scope resolves a docs-only change', async () => {
    await withServer(async (send, readNext) => {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0.0.1' } } });
      await readNext();
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'classify_review_scope', arguments: { changedFiles: ['README.md'] } } });
      const response = (await readNext()) as { result: { content: { text: string }[] } };
      const payload = JSON.parse(response.result.content[0].text);
      expect(payload.status).toBe('resolved');
      expect(payload.reviewLane).toBe('docs');
    });
  }, 10000);
});
