import { CopyButton } from './ui/Misc';

export function ingestSnippet(key = 'pulse_<keyId>_<secret>') {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `curl -X POST ${origin}/api/v1/ingest/events \\
  -H "Content-Type: application/json" \\
  -H "X-Pulse-Key: ${key}" \\
  -d '{
    "id": "req_01",
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "method": "GET",
    "route": "/v1/orders/{id}",
    "statusCode": 200,
    "latencyMs": 42,
    "responseBytes": 1830,
    "clientId": "customer_8f3a"
  }'`;
}

export function IngestSnippet({ apiKey }: { apiKey?: string }) {
  const code = ingestSnippet(apiKey);
  return (
    <div className="overflow-hidden rounded-lg border border-navy-700 bg-navy-900">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="font-mono text-2xs text-slate-400">bash</span>
        <CopyButton value={code} className="!h-7 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
