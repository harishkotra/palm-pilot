// Offline checks for the pure parsing layer. No network, no mocks: these are
// just the string/URL rules the real client depends on.
import { normaliseBaseUrl, pickJson, DEFAULT_BASE_URL } from '../src/llmClient';

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  }
};

eq('empty -> particle default', normaliseBaseUrl(''), DEFAULT_BASE_URL);
eq('bare host gets /v1', normaliseBaseUrl('api.particle.ai'), 'https://api.particle.ai/v1');
eq('full url kept', normaliseBaseUrl('https://api.particle.ai/v1/'), 'https://api.particle.ai/v1');
eq('private host -> http', normaliseBaseUrl('192.168.1.9:1234/v1'), 'http://192.168.1.9:1234/v1');
eq('localhost -> http + v1', normaliseBaseUrl('localhost:11434'), 'http://localhost:11434/v1');
eq('172.16 -> http', normaliseBaseUrl('172.16.0.4:8000/v1'), 'http://172.16.0.4:8000/v1');
eq('172.32 -> https', normaliseBaseUrl('172.32.0.4'), 'https://172.32.0.4/v1');

eq('plain json', pickJson('{"a":1}'), { a: 1 });
eq('fenced json', pickJson('```json\n{"a":2}\n```'), { a: 2 });
eq('json after prose', pickJson('Sure! {"tool":"Read","detail":"x","risk":"low"} done'), {
  tool: 'Read',
  detail: 'x',
  risk: 'low',
});
eq('array', pickJson('here: [1,2,3]'), [1, 2, 3]);
eq('braces in string', pickJson('{"detail":"rm -rf {tmp}"}'), { detail: 'rm -rf {tmp}' });
eq('garbage -> null', pickJson('no json here'), null);
eq('truncated -> null', pickJson('{"a":1'), null);

console.log(fail === 0 ? `ALL PARSE TESTS PASSED (${pass})` : `${fail} FAILED / ${pass} passed`);
process.exit(fail === 0 ? 0 : 1);
