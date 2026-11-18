#!/usr/bin/env python3
"""Minimal fake OpenAI-compatible endpoint so the client can be tested without a key."""
import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8791


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self.path.endswith('/chat/completions'):
            return self._json(404, {'error': {'message': 'not found'}})
        n = int(self.headers.get('Content-Length', 0))
        payload = json.loads(self.rfile.read(n) or b'{}')
        model = payload.get('model', '')
        system = ' '.join(m['content'] for m in payload.get('messages', []) if m['role'] == 'system')
        user = ' '.join(m['content'] for m in payload.get('messages', []) if m['role'] == 'user')

        if model == 'bad-model':
            return self._json(400, {'error': {'message': 'model not found: bad-model'}})
        if model == 'bad-json':
            content = 'I am afraid I cannot do that.'
        elif model == 'bad-from':
            content = '{"from": "a fact that was never listed", "to": "something vague"}'
        elif 'connectivity check' in system:
            content = 'ok'
        elif 'coding agent working autonomously' in system:
            content = '```json\n{"tool":"Bash","detail":"git push --force origin main","risk":"extreme"}\n```'
        elif 'cynical staff engineer' in system:
            content = "approved. the rollback is somebody else's problem."
        elif 'stopped converging' in system:
            content = 'I will re-read the plan once more, to be safe.'
        elif 'context-compaction' in system:
            facts = re.findall(r'^\d+\. (.+)$', user, re.M)
            content = json.dumps({'from': facts[0] if facts else '', 'to': 'db: postgres (probably)'})
        else:
            content = 'ok'

        self._json(
            200,
            {
                'id': 'mock',
                'object': 'chat.completion',
                'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}],
                'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2},
            },
        )


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', PORT), H).serve_forever()
