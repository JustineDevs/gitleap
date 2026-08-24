export {};

const received = { traces: 0, metrics: 0 };
const collector = Bun.serve({
  port: 0,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/v1/traces") received.traces++;
    if (pathname === "/v1/metrics") received.metrics++;
    return new Response(null, { status: 200 });
  },
});

process.env.OTEL_SERVICE_NAME = "gitleap-tracing-smoke";
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${collector.port}`;
const { shutdownTracing, withTracing } = await import("./tracing");

try {
  const handler = withTracing(async () => new Response("ok"));
  const response = await handler(new Request("http://localhost/health"));
  if (response.status !== 200) throw new Error(`unexpected response: ${response.status}`);
  await response.text();
  await shutdownTracing();
  if (received.traces < 1 || received.metrics < 1)
    throw new Error(`OTLP export missing: ${JSON.stringify(received)}`);
  console.log(JSON.stringify({ traces: received.traces, metrics: received.metrics }));
} finally {
  collector.stop(true);
}
