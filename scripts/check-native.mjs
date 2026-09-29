import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stringify, parse } from 'smol-toml';
import { ROOT, loadConfig, render } from '../src/router.mjs';

// Read-only native configuration parsing. No model requests, profile installation,
// feature enablement, or user-config writes are performed by `features list`.
const binary = process.argv[2] || 'codex';
const files = render(loadConfig(path.join(ROOT, 'routing.toml')));
for (const [relative, expected] of files) {
  const filename = path.join(ROOT, 'dist', relative);
  if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== expected) {
    console.error(`Missing or stale bundle file: ${relative}. Run npm run build first.`);
    process.exit(1);
  }
}
const profile = parse(files.get('task-routing.config.toml') || [...files.entries()].find(([p]) => p.endsWith('.config.toml'))[1]);
for (const [key, value] of Object.entries(profile.agents)) {
  if (key.startsWith('tr_')) value.config_file = path.join(ROOT, 'dist', value.config_file);
}

function flatten(table, prefix = '') {
  return Object.entries(table).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) return flatten(value, name);
    const encoded = stringify({ value }).slice('value = '.length).trim();
    return ['-c', `${name}=${encoded}`];
  });
}

const layers = [['profile', profile], ...Object.keys(profile.agents).filter(k => k.startsWith('tr_')).map(k => {
  const filename = profile.agents[k].config_file;
  return [k, { ...profile, ...parse(fs.readFileSync(filename, 'utf8')) }];
})];
for (const [name, config] of layers) {
  const result = spawnSync(binary, [...flatten(config), 'features', 'list'], { encoding: 'utf8', timeout: 15000 });
  if (result.error || result.status !== 0) {
    console.error(`${name}: ${result.error?.message || result.stderr || result.stdout}`);
    process.exit(1);
  }
  console.log(`Native config accepted: ${name}`);
}
