import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'smol-toml';
import { ROOT, ROLE_META, loadConfig, render, inspectCatalog, mergeAgents, planInstall, applyInstall } from '../src/router.mjs';

const defaultConfig = () => loadConfig(path.join(ROOT, 'routing.toml'));
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-router-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(root, relative, content) {
  const p = path.join(root, relative);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

test('all independently configured models, efforts and providers reach native role layers', () => {
  const c = defaultConfig();
  for (const [i, role] of Object.keys(ROLE_META).entries()) {
    c.roles[role] = { model: `custom/model-${i}`, effort: `level-${i}`, provider: `provider_${i}` };
  }
  const files = render(c);
  const profile = parse(files.get('task-routing.config.toml'));
  for (const [role, settings] of Object.entries(c.roles)) {
    const nativePath = profile.agents[`tr_${role}`].config_file;
    const actual = parse(files.get(nativePath));
    assert.equal(actual.model, settings.model);
    assert.equal(actual.model_reasoning_effort, settings.effort);
    assert.equal(actual.model_provider, settings.provider);
    assert.equal(actual.sandbox_mode, ROLE_META[role].sandbox);
    assert.ok(actual.developer_instructions.length > 100);
  }
  assert.equal(profile.agents.default_subagent_model, c.roles.search.model);
});

test('changing the coding model leaves every other role configuration unchanged', () => {
  const c = defaultConfig(), before = render(c);
  c.roles.coding.model = 'another-coder';
  c.roles.coding.effort = 'max';
  const after = render(c);
  for (const role of Object.keys(ROLE_META).filter(r => r !== 'coding')) {
    assert.equal(before.get(`agents/task-routing/${role}.toml`), after.get(`agents/task-routing/${role}.toml`));
  }
  assert.notEqual(before.get('agents/task-routing/coding.toml'), after.get('agents/task-routing/coding.toml'));
});

test('configuration rejects misspelled roles, absent efforts and escaping profile names', t => {
  const dir = fixture(t);
  for (const mutate of [c => { c.roles.seach = c.roles.search; }, c => { delete c.roles.coding.effort; }, c => { c.profile = '../escape'; }]) {
    const c = defaultConfig(); mutate(c);
    const filename = put(dir, 'routing.toml', stringify(c));
    assert.throws(() => loadConfig(filename));
  }
});

test('configuration accepts provider-specific effort labels without a hardcoded enum', t => {
  const c = defaultConfig(); c.roles.coding.effort = 'adaptive';
  assert.equal(loadConfig(put(fixture(t), 'routing.toml', stringify(c))).roles.coding.effort, 'adaptive');
});

test('generated local skill references resolve inside the bundle', () => {
  const files = render(defaultConfig());
  for (const [relative, content] of files) {
    if (!relative.endsWith('.md')) continue;
    for (const match of content.matchAll(/\]\(([^)]+\.md)\)/g)) {
      const referenced = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
      assert.ok(files.has(referenced), `${relative} references missing ${referenced}`);
    }
  }
});

test('preview writes nothing and install preserves existing base config and AGENTS text', t => {
  const dir = fixture(t);
  const base = '# existing provider and private settings\nmodel = "previous"\n';
  put(dir, 'config.toml', base);
  put(dir, 'AGENTS.md', 'Existing project preferences.\n');
  const files = render(defaultConfig());
  const changes = planInstall(files, dir);
  assert.equal(fs.existsSync(path.join(dir, 'task-routing.config.toml')), false);
  applyInstall(changes, dir);
  assert.equal(fs.readFileSync(path.join(dir, 'config.toml'), 'utf8'), base);
  assert.ok(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').startsWith('Existing project preferences.\n'));
  assert.equal(planInstall(files, dir).length, 0);
});

test('updating owned models makes a backup and preserves AGENTS additions', t => {
  const dir = fixture(t), c = defaultConfig();
  c.roles.coding.effort = 'low';
  applyInstall(planInstall(render(c), dir), dir);
  fs.appendFileSync(path.join(dir, 'AGENTS.md'), '\nMy later instructions.\n');
  const previous = fs.readFileSync(path.join(dir, 'agents/task-routing/coding.toml'), 'utf8');
  c.roles.coding.effort = 'max';
  const result = applyInstall(planInstall(render(c), dir), dir);
  assert.ok(result.backup);
  assert.equal(fs.readFileSync(path.join(result.backup, 'agents/task-routing/coding.toml'), 'utf8'), previous);
  assert.ok(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').endsWith('My later instructions.\n'));
  assert.equal(parse(fs.readFileSync(path.join(dir, 'agents/task-routing/coding.toml'), 'utf8')).model_reasoning_effort, 'max');
});

test('unowned files and edited managed roles are refused before any writes', t => {
  const dir = fixture(t), files = render(defaultConfig());
  put(dir, 'task-routing.config.toml', '# another profile\n');
  assert.throws(() => planInstall(files, dir), /unowned or edited/);
  assert.equal(fs.existsSync(path.join(dir, 'agents')), false);
  fs.unlinkSync(path.join(dir, 'task-routing.config.toml'));
  applyInstall(planInstall(files, dir), dir);
  fs.appendFileSync(path.join(dir, 'agents/task-routing/coding.toml'), '\n# manual change\n');
  assert.throws(() => planInstall(files, dir), /unowned or edited/);
});

test('a stale plan cannot overwrite concurrent changes', t => {
  const dir = fixture(t), files = render(defaultConfig());
  const changes = planInstall(files, dir);
  put(dir, 'AGENTS.md', 'Written after preview.');
  assert.throws(() => applyInstall(changes, dir), /changed after planning/);
  assert.equal(fs.existsSync(path.join(dir, 'agents')), false);
});

test('ambiguous AGENTS markers and stale profile renames fail explicitly', t => {
  assert.throws(() => mergeAgents('<!-- codex-task-router:start -->', 'x'), /ambiguous/);
  const dir = fixture(t), c = defaultConfig();
  applyInstall(planInstall(render(c), dir), dir);
  c.profile = 'renamed';
  assert.throws(() => planInstall(render(c), dir), /stale/);
});

test('unsafe manifest paths are rejected without writing outside the target', t => {
  const dir = fixture(t);
  assert.throws(() => planInstall(new Map([['../escape', 'no']]), dir), /Unsafe/);
});

test('directory links cannot redirect role installation', t => {
  const dir = fixture(t), other = fixture(t);
  fs.symlinkSync(other, path.join(dir, 'agents'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => planInstall(render(defaultConfig()), dir), /symlink\/junction/);
  assert.deepEqual(fs.readdirSync(other), []);
});

test('doctor catches unavailable models and unsupported reasoning before installation', t => {
  const dir = fixture(t), c = defaultConfig();
  c.orchestrator = { model: 'gpt-6-astra', effort: 'medium' };
  c.roles.coding = { model: 'deepseek-flash', effort: 'low' };
  c.roles.search = c.roles.verify = c.roles.general = { model: 'gpt-6-sol', effort: 'medium' };
  c.roles.reasoning = { model: 'gpt-6-astra', effort: 'high' };
  put(dir, 'config.toml', 'model_catalog_json = "models.json"\n');
  put(dir, 'models.json', JSON.stringify({ models: [
    { slug: 'gpt-6-astra', supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'high' }] },
    { slug: 'gpt-6-sol', supported_reasoning_levels: [{ effort: 'medium' }] },
    { slug: 'deepseek-flash', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'max' }] },
  ] }));
  assert.deepEqual(inspectCatalog(c, dir).errors, []);
  c.roles.coding.effort = 'medium';
  assert.match(inspectCatalog(c, dir).errors.join('\n'), /unsupported/);
  c.roles.coding.model = 'absent';
  assert.match(inspectCatalog(c, dir).errors.join('\n'), /absent from/);
});

test('doctor resolves providers and rejects undefined ones without reading credentials', t => {
  const dir = fixture(t), c = defaultConfig();
  put(dir, 'config.toml', 'model_provider = "gateway"\n[model_providers.gateway]\nname = "Gateway"\n');
  assert.equal(inspectCatalog(c, dir).rows[1].provider, 'gateway');
  c.roles.coding.provider = 'missing';
  assert.match(inspectCatalog(c, dir).errors.join('\n'), /not defined/);
});

test('CLI build produces a parseable profile and CLI install defaults to preview', t => {
  const dir = fixture(t), out = path.join(dir, 'bundle'), home = path.join(dir, 'home');
  const build = spawnSync(process.execPath, [path.join(ROOT, 'cli.mjs'), 'build', '--out', out], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const profile = parse(fs.readFileSync(path.join(out, 'task-routing.config.toml'), 'utf8'));
  assert.equal(profile.model, 'gpt-6-astra');
  const preview = spawnSync(process.execPath, [path.join(ROOT, 'cli.mjs'), 'install', '--codex-home', home], { encoding: 'utf8' });
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Preview only/);
  assert.equal(fs.existsSync(home), false);
});
