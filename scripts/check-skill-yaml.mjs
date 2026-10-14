import fs from "node:fs"; import path from "node:path"; import YAML from "yaml";
const root = process.argv[2]; let bad = 0;
function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith(".md") && f!=="README.md") {
  const raw = fs.readFileSync(p,"utf8"); const m = raw.match(/^---\n([\s\S]*?)\n---\n/); if(!m){console.log("NOFM",p);bad++;continue;}
  try { YAML.parse(m[1]); } catch(e){ bad++; console.log(p, e.message.split("\n")[0]); } } } }
walk(root); console.log("bad", bad);
