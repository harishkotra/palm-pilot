// Exercises the OpenAI-compatible client and the four prompt tasks against a
// local mock endpoint (tools/mock_llm.py). Run: npm run test:llm
import { chat, normaliseBaseUrl, pickJson, LlmError } from '../src/llmClient';
import { proposeTool, consequenceLine, panicLine, compactFact } from '../src/llmTasks';

const BASE = 'http://127.0.0.1:8791/v1';
const cfg = (model: string) => ({ baseUrl: BASE, apiKey: '', model });

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

async function main() {
  // URL normalisation
  check('bare host gains https + /v1', normaliseBaseUrl('api.openai.com') === 'https://api.openai.com/v1');
  check('lan host uses http', normaliseBaseUrl('192.168.68.59:11434') === 'http://192.168.68.59:11434/v1');
  check('trailing slash stripped', normaliseBaseUrl('https://openrouter.ai/api/v1/') === 'https://openrouter.ai/api/v1');
  check('existing path kept', normaliseBaseUrl('http://localhost:1234/v1') === 'http://localhost:1234/v1');

  // JSON extraction
  check('fenced json parsed', pickJson<any>('```json\n{"a":1}\n```')?.a === 1);
  check('prose-wrapped json parsed', pickJson<any>('sure: {"b":2} done')?.b === 2);
  check('garbage returns null', pickJson('no object here') === null);

  // A real round-trip through the mock
  const raw = await chat(cfg('mock'), [{ role: 'user', content: 'ping' }]);
  check('chat returns content', raw === 'ok', raw);

  const p = await proposeTool(cfg('mock'), ['Read src/auth/session.ts']);
  check('proposeTool parses tool call', p?.tool === 'Bash' && p?.risk === 'extreme', JSON.stringify(p));
  check('proposeTool keeps detail', p?.detail === 'git push --force origin main', p?.detail);

  const bad = await proposeTool(cfg('bad-json'), []);
  check('proposeTool returns null on prose', bad === null, JSON.stringify(bad));

  const line = await consequenceLine(cfg('mock'), { tool: 'Bash', detail: 'x', risk: 'high' }, 'approve');
  check('consequenceLine returns one short line', !!line && line.length <= 70, String(line));

  const panic = await panicLine(cfg('mock'), 2, 240);
  check('panicLine returns a line', !!panic && panic.length > 5, String(panic));

  const facts = ['we agreed to use Postgres, not Mongo', 'DO NOT refactor the billing module'];
  const pick = await compactFact(cfg('mock'), facts);
  check('compactFact maps a listed fact', pick?.from === facts[0], JSON.stringify(pick));
  check('compactFact summarises', !!pick?.to && pick.to.length <= 44, pick?.to);

  const badPick = await compactFact(cfg('bad-from'), facts);
  check('compactFact rejects an invented fact', badPick === null, JSON.stringify(badPick));

  // Error surfaces rather than hanging
  let err: any = null;
  try {
    await chat({ baseUrl: BASE, apiKey: '', model: 'bad-model' }, [{ role: 'user', content: 'hi' }]);
  } catch (e) {
    err = e;
  }
  check('bad model raises LlmError with status', err instanceof LlmError && err.status === 400, String(err));
  check('LlmError carries provider message', String(err?.message).includes('model not found'), String(err?.message));

  console.log(`\n${fail === 0 ? 'ALL LLM TESTS PASSED' : `${fail} LLM TEST(S) FAILED`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('SUITE ERROR', e);
  process.exit(1);
});
