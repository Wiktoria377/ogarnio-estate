// Minimal stand-in for Supabase's API gateway (Kong): routes /auth/v1 to GoTrue
// and /rest/v1 to PostgREST on one origin, which is what supabase-js expects.
import http from "node:http";
const routes = [
  ["/auth/v1", Number(process.env.AUTH_PORT ?? 9999)],
  ["/rest/v1", Number(process.env.REST_PORT ?? 3001)],
  // Supabase Storage API (github.com/supabase/storage), optional: STORAGE_DRIVER=supabase tests.
  ["/storage/v1", Number(process.env.STORAGE_PORT ?? 5000)],
];
const port = Number(process.env.GATEWAY_PORT ?? 54321);
http
  .createServer((req, res) => {
    const route = routes.find(([prefix]) => req.url.startsWith(prefix));
    if (!route) { res.writeHead(404).end("not found"); return; }
    const [prefix, target] = route;
    const headers = { ...req.headers, host: `localhost:${target}` };
    if (prefix === "/rest/v1" && !headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
    const upstream = http.request(
      { host: "127.0.0.1", port: target, path: req.url.slice(prefix.length) || "/", method: req.method, headers },
      (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
    );
    upstream.on("error", (e) => { res.writeHead(502).end(String(e)); });
    req.pipe(upstream);
  })
  .listen(port, () => console.log(`gateway on :${port}`));
