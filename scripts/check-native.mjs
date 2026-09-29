import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { stringify, parse } from 'smol-toml';
import { ROOT, loadConfig, render } from '../src/router.mjs';

// Validate configuration and discovery via an ephemeral app-server thread.
// No turn is submitted, so this check performs no model inference.
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
  const { name, description, nickname_candidates, ...layer } = parse(fs.readFileSync(filename, 'utf8'));
  if (name !== k || typeof description !== 'string' || !description.trim()) {
    throw new Error(`${filename}: discovery requires a matching name and non-empty description`);
  }
  return [k, { ...profile, ...layer }];
})];
for (const [name, config] of layers) {
  const result = spawnSync(binary, [...flatten(config), 'features', 'list'], { encoding: 'utf8', timeout: 15000 });
  if (result.error || result.status !== 0) {
    console.error(`${name}: ${result.error?.message || result.stderr || result.stdout}`);
    process.exit(1);
  }
  console.log(`Native config accepted: ${name}`);
}

const startup = await new Promise((resolve, reject) => {
  const child = spawn(binary, [...flatten(profile), 'app-server', '--stdio'], {
    cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const warnings = [];
  let stderr = '', result, failure, finishing = false;
  const lines = createInterface({ input: child.stdout });
  const finish = error => {
    if (finishing) return;
    finishing = true;
    failure = error;
    child.stdin.end();
    if (child.exitCode === null) child.kill();
  };
  const timeout = setTimeout(() => finish(new Error('App-server startup check timed out')), 20000);
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-32768); });
  child.stdin.on('error', error => { if (!finishing) finish(error); });
  child.on('error', finish);
  child.on('close', () => {
    clearTimeout(timeout);
    lines.close();
    if (failure) return reject(failure);
    if (!result) return reject(new Error(`App-server exited before thread startup: ${stderr}`));
    if (warnings.length || /Ignoring malformed agent role definition/i.test(stderr)) {
      return reject(new Error(`Agent discovery failed: ${warnings.join('\n') || stderr}`));
    }
    resolve(result);
  });
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.error) return finish(new Error(JSON.stringify(message.error)));
    if (/Ignoring malformed agent role definition/i.test(JSON.stringify(message))) warnings.push(JSON.stringify(message.params));
    if (message.id === 1) {
      send({ method: 'initialized', params: {} });
      send({ id: 2, method: 'thread/start', params: { cwd: ROOT, ephemeral: true } });
    } else if (message.id === 2) {
      result = message.result;
      // A read-only request drains earlier startup notifications before shutdown.
      send({ id: 3, method: 'config/read', params: { includeLayers: false } });
    } else if (message.id === 3) finish();
  });
  send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'task-router-check', version: '0.1.0' }, capabilities: { experimentalApi: true } } });
});
console.log(`Agent discovery startup passed: ${startup.model} (${startup.modelProvider}); no model turn submitted.`);
