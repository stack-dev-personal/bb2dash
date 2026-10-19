// bb2dash Phase 25a, W-100, PROBE ONLY (P-2). Runs inside the probe client, Node 22.23.3.
//
//   node fetch-probe.mjs native   global fetch, as mcp-server/src/client.ts and
//                                 workspace-ingest/src/embed.ts call it today
//   node fetch-probe.mjs undici   global fetch with an undici EnvHttpProxyAgent as its dispatcher
//
// The URL is the bb2dash project's REST root with no key: it answers 401, and any HTTP answer at
// all proves the request left through the proxy (the client's network has no other way out).
// Prints one JSON line; never sends a credential.
const TARGET = 'https://goultdzqcavefcgnifdy.supabase.co/rest/v1/';
const TIMEOUT_MS = 15_000;

async function main(mode) {
  const init = { signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (mode === 'undici') {
    const { EnvHttpProxyAgent } = await import('undici');
    init.dispatcher = new EnvHttpProxyAgent();
  } else if (mode !== 'native') {
    throw new Error(`unknown mode ${mode}`);
  }
  try {
    const response = await fetch(TARGET, init);
    await response.text();
    return { mode, reached: true, status: response.status };
  } catch (error) {
    const cause = error?.cause?.code ?? error?.cause?.message ?? error?.name;
    return { mode, reached: false, error: String(cause ?? error) };
  }
}

const result = await main(process.argv[2] ?? 'native');
console.log(JSON.stringify({
  ...result,
  node: process.versions.node,
  undici: process.versions.undici,
  NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY ?? null,
  HTTPS_PROXY: process.env.HTTPS_PROXY ?? null,
}));
