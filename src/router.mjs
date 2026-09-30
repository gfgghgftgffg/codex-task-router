import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'smol-toml';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ROLE_META = {
  coding: { description: 'Implement bounded code and tests from supplied evidence and acceptance criteria.', sandbox: 'workspace-write' },
  search: { description: 'Read-only repository exploration, source research, and evidence gathering.', sandbox: 'read-only' },
  verify: { description: 'Independently verify changed behavior; run checks without editing source.', sandbox: 'workspace-write' },
  reasoning: { description: 'Resolve a bounded difficult decision or independent high-risk review; no coding.', sandbox: 'read-only' },
  general: { description: 'Produce non-coding summaries, prose, structured information, and analysis.', sandbox: 'workspace-write' },
};
const START = '<!-- codex-task-router:start -->';
const END = '<!-- codex-task-router:end -->';
const MANIFEST = '.task-router/manifest.json';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = p => fs.readFileSync(p, 'utf8');
export const defaultCodexHome = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

export function activationInstructions(profile) {
  return [
    `The task-routing profile "${profile}" is active.`,
    'Before implementing or delegating, the parent reads the installed task-routing skill (skills/task-routing/SKILL.md under CODEX_HOME) and follows its generated role map.',
    'Route every code change, including small fixes, to the configured coding role and actually invoke it; every completed coding work unit needs an independent verify verdict.',
    'Assigned children stay inside their brief and do not start routing workflows of their own.',
    'User instructions and host permissions take precedence.',
  ].join(' ');
}

export function readBaseInstructions(codexHome) {
  const target = safeTarget(codexHome, 'config.toml');
  if (!fs.existsSync(target)) return { target, content: undefined, text: '' };
  const content = read(target);
  let parsed;
  try {
    parsed = parse(content.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Cannot parse ${target}: ${error.message}`);
  }
  return { target, content, text: typeof parsed.developer_instructions === 'string' ? parsed.developer_instructions : '' };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fields(value, allowed, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected a table`);
  for (const key of Object.keys(value)) assert(allowed.includes(key), `${label}: unknown setting '${key}'`);
}

function modelConfig(value, label) {
  fields(value, ['model', 'effort', 'provider'], label);
  for (const key of ['model', 'effort']) {
    assert(typeof value[key] === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]*$/.test(value[key]), `${label}.${key}: expected a non-empty model/effort identifier`);
  }
  if (value.provider !== undefined) assert(typeof value.provider === 'string' && /^[a-zA-Z0-9_-]+$/.test(value.provider), `${label}.provider: invalid provider ID`);
}

export function loadConfig(filename) {
  const c = parse(read(filename).replace(/^\uFEFF/, ''));
  fields(c, ['version', 'profile', 'max_concurrent', 'max_coding_repairs', 'orchestrator', 'roles'], 'routing');
  assert(c.version === 1, 'version must be 1');
  assert(typeof c.profile === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(c.profile), 'profile must be a lowercase name, not a path');
  assert(Number.isInteger(c.max_concurrent) && c.max_concurrent >= 1 && c.max_concurrent <= 32, 'max_concurrent must be 1..32');
  assert(Number.isInteger(c.max_coding_repairs) && c.max_coding_repairs >= 0 && c.max_coding_repairs <= 5, 'max_coding_repairs must be 0..5');
  modelConfig(c.orchestrator, 'orchestrator');
  fields(c.roles, Object.keys(ROLE_META), 'roles');
  for (const role of Object.keys(ROLE_META)) modelConfig(c.roles[role], `roles.${role}`);
  return c;
}

function nativeModel(settings) {
  return {
    model: settings.model,
    model_reasoning_effort: settings.effort,
    ...(settings.provider ? { model_provider: settings.provider } : {}),
  };
}

export function render(c, options = {}) {
  const files = new Map();
  const activation = activationInstructions(c.profile);
  const base = typeof options.baseInstructions === 'string' ? options.baseInstructions : '';
  const profile = {
    ...nativeModel(c.orchestrator),
    developer_instructions: base ? base + (base.endsWith('\n') ? '\n' : '\n\n') + activation : activation,
    agents: {
      enabled: true,
      max_concurrent_threads_per_session: c.max_concurrent,
      default_subagent_model: c.roles.search.model,
      default_subagent_reasoning_effort: c.roles.search.effort,
    },
  };
  const rows = [];
  for (const [role, meta] of Object.entries(ROLE_META)) {
    const settings = c.roles[role];
    const contract = read(path.join(ROOT, 'roles', `${role}.md`));
    const nativePath = `agents/task-routing/${role}.toml`;
    profile.agents[`tr_${role}`] = { description: meta.description, config_file: nativePath };
    files.set(nativePath, stringify({ name: `tr_${role}`, description: meta.description, ...nativeModel(settings), sandbox_mode: meta.sandbox, developer_instructions: contract }));
    files.set(`skills/task-routing/references/roles/${role}.md`, contract);
    rows.push(`| ${role} | tr_${role} | ${settings.model} | ${settings.effort} | ${settings.provider || 'inherit active provider'} | [contract](roles/${role}.md) |`);
  }
  files.set(`${c.profile}.config.toml`, '# Generated from routing.toml. Rebuild to change models or efforts.\n' + stringify(profile));
  for (const relative of ['SKILL.md', 'references/coding-quality.md', 'references/research-evidence.md', 'agents/openai.yaml']) {
    files.set(`skills/task-routing/${relative}`, read(path.join(ROOT, 'skill', relative)));
  }
  files.set('skills/task-routing/references/role-map.md', [
    '# Configured roles', '',
    'Generated from routing.toml. These are defaults. An explicit user model or effort instruction overrides the corresponding default only within its stated task or role scope; other settings remain unchanged. Examples and a parent-model selection alone are not child overrides. Do not rewrite persistent configuration for a one-off request.', '',
    `Parent profile: ${c.profile}; model: ${c.orchestrator.model}; effort: ${c.orchestrator.effort}.`,
    `Maximum concurrent children: ${c.max_concurrent}. Maximum coding repair follow-ups per work unit: ${c.max_coding_repairs}.`, '',
    '| Work | Native role | Model | Effort | Provider | Instructions |',
    '| --- | --- | --- | --- | --- | --- |', ...rows, '',
    'Named roles carry their provider, sandbox, and instructions. A model-only spawn is not equivalent when it cannot preserve these settings.',
    'Use supported per-spawn model/effort overrides for explicit user choices. If named roles are unavailable, read the selected contract and explicitly select the effective model and effort only when the host can enforce the required provider and permissions. Use fork_turns="none" or fork_context=false only if that parameter exists in the exposed tool schema.',
    'If the effective model, effort, or role is rejected, report the exact route and failure. Do not silently fall back to the default, fabricate success, use an unnamed inherited-model fork, or weaken permissions.', '',
  ].join('\n'));
  files.set('AGENTS.md', [START,
    'When the task-routing profile is active or the user invokes $task-routing, use that skill for delegation. Otherwise keep the existing workflow.',
    'Its role map defines defaults. Explicit user model/effort instructions take precedence for their stated task or role scope without changing persistent settings. Preserve host permissions and project constraints; report unsupported choices instead of silently substituting models.',
    'The parent owns direction and decisions; assigned children follow their role without recursively orchestrating. Load only the role and workflow guidance needed for this task.',
    'Research summaries are navigation aids. Before important evidence-based decisions, the main agent reads the relevant originals and checks coverage; another child does not replace this judgment.',
    'Within the authorized task, continue through the requested deliverable and relevant acceptance checks, fixing failures caused by the change. Do not stop at a first draft or add routine approval checkpoints. Report concrete blockers and unverified requirements.',
    'Match reading and verification to the task. Do not force every role, a full-repository survey, repeated successful checks, or unrelated improvements. Completion does not expand scope or external-action permissions.',
    END, '',
  ].join('\n'));
  return files;
}

export function inspectCatalog(c, codexHome, catalogOverride) {
  const errors = [], warnings = [], rows = [];
  const configPath = path.join(codexHome, 'config.toml');
  const base = fs.existsSync(configPath) ? parse(read(configPath).replace(/^\uFEFF/, '')) : {};
  const catalogPath = catalogOverride ? path.resolve(catalogOverride)
    : base.model_catalog_json ? path.resolve(codexHome, base.model_catalog_json) : undefined;
  let catalog;
  if (catalogPath && fs.existsSync(catalogPath)) {
    catalog = JSON.parse(read(catalogPath).replace(/^\uFEFF/, ''));
    assert(Array.isArray(catalog.models), 'Model catalog must contain a models array');
  } else warnings.push('No configured model catalog found; model availability and effort support are unverified.');
  for (const [name, settings] of Object.entries({ orchestrator: c.orchestrator, ...c.roles })) {
    const provider = settings.provider || c.orchestrator.provider || base.model_provider || 'openai';
    if (provider !== 'openai' && provider !== 'ollama' && provider !== 'lmstudio' && !base.model_providers?.[provider]) {
      errors.push(`${name}: provider '${provider}' is not defined in the existing Codex config`);
    }
    const model = catalog?.models.find(m => m.slug === settings.model);
    if (catalog && !model) errors.push(`${name}: '${settings.model}' is absent from the configured model catalog`);
    if (model) {
      const efforts = (model.supported_reasoning_levels || []).map(v => typeof v === 'string' ? v : v.effort);
      if (efforts.length && !efforts.includes(settings.effort)) errors.push(`${name}: effort '${settings.effort}' is unsupported; advertised: ${efforts.join(', ')}`);
      if (!efforts.length) warnings.push(`${name}: catalog does not advertise reasoning levels`);
    }
    rows.push({ role: name, model: settings.model, effort: settings.effort, provider });
  }
  if (c.roles.search.provider && c.roles.search.provider !== (c.orchestrator.provider || base.model_provider || 'openai')) {
    warnings.push('Search uses another provider. Unnamed child defaults cannot select that provider; always use named roles.');
  }
  warnings.push('Catalog checks do not prove server access or live subagent support. Restart Codex after installation and verify the first real dispatch.');
  return { errors, warnings, rows, catalogPath };
}

export function mergeAgents(existing, block) {
  const starts = existing.split(START).length - 1;
  const ends = existing.split(END).length - 1;
  assert(starts === ends && starts <= 1, 'AGENTS.md contains ambiguous task-router markers');
  if (!starts) return existing + (existing && !existing.endsWith('\n') ? '\n' : '') + (existing ? '\n' : '') + block;
  const start = existing.indexOf(START), end = existing.indexOf(END);
  assert(end > start, 'AGENTS.md task-router markers are out of order');
  return existing.slice(0, start) + block.trimEnd() + existing.slice(end + END.length);
}

function safeTarget(root, relative) {
  assert(!path.isAbsolute(relative) && !relative.split(/[\\/]/).some(p => p === '..' || p === ''), `Unsafe managed path: ${relative}`);
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  assert(target.startsWith(resolvedRoot + path.sep), `Path escapes target: ${relative}`);
  let current = target;
  while (current !== resolvedRoot) {
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat) assert(!stat.isSymbolicLink(), `Refusing symlink/junction: ${current}`);
    current = path.dirname(current);
  }
  return target;
}

function writeAtomic(target, content) {
  const temporary = `${target}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function planInstall(files, home, options = {}) {
  const manifestPath = safeTarget(home, MANIFEST);
  const base = options.base ?? readBaseInstructions(home);
  // The base config and every managed target are captured as preimages, so a plan
  // that would write nothing is still rejected once anything it read has changed.
  const guards = [{ target: base.target, old: base.content, label: 'Base config' }];
  let previous = { version: 1, files: {} };
  if (fs.existsSync(manifestPath)) {
    previous = JSON.parse(read(manifestPath));
    assert(previous.version === 1 && previous.files && typeof previous.files === 'object' && !Array.isArray(previous.files), 'Invalid install manifest');
  }
  const changes = [];
  const hashes = {};
  for (const [relative, generated] of files) {
    const target = safeTarget(home, relative);
    const exists = fs.existsSync(target);
    const old = exists ? read(target) : undefined;
    guards.push({ target, old, label: 'Managed file' });
    let content = generated;
    if (relative === 'AGENTS.md') content = mergeAgents(old || '', generated);
    else if (exists && old !== generated) {
      assert(previous.files[relative] && hash(old) === previous.files[relative], `Preserving unowned or edited file: ${target}`);
    }
    hashes[relative] = hash(content);
    if (old !== content) changes.push({ relative, target, content, old });
  }
  for (const relative of Object.keys(previous.files)) {
    assert(files.has(relative), `Previously managed path would become stale: ${relative}. Keep the profile name stable or use a separate Codex home.`);
  }
  const manifest = JSON.stringify({ version: 1, files: hashes }, null, 2) + '\n';
  const oldManifest = fs.existsSync(manifestPath) ? read(manifestPath) : undefined;
  guards.push({ target: manifestPath, old: oldManifest, label: 'Managed file' });
  if (manifest !== oldManifest) changes.push({ relative: MANIFEST, target: manifestPath, content: manifest, old: oldManifest });
  Object.defineProperty(changes, 'guards', { value: guards });
  return changes;
}

export function applyInstall(changes, home) {
  for (const guard of changes.guards ?? []) {
    const actual = fs.existsSync(guard.target) ? read(guard.target) : undefined;
    assert(actual === guard.old, `${guard.label} changed after planning: ${guard.target}`);
  }
  if (!changes.length) return { written: 0, backup: null };
  // Verify every preimage before writing, so a stale plan never overwrites newer edits.
  for (const change of changes) {
    safeTarget(home, change.relative);
    const actual = fs.existsSync(change.target) ? read(change.target) : undefined;
    assert(actual === change.old, `Target changed after planning: ${change.target}`);
  }
  const backupRelative = `.task-router/backups/${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const backup = safeTarget(home, backupRelative);
  const applied = [];
  try {
    for (const change of changes) {
      if (change.old !== undefined) {
        const dest = safeTarget(home, `${backupRelative}/${change.relative}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, change.old, { flag: 'wx', mode: 0o600 });
      }
      fs.mkdirSync(path.dirname(change.target), { recursive: true });
      writeAtomic(change.target, change.content);
      applied.push(change);
    }
  } catch (error) {
    for (const change of applied.reverse()) {
      if (change.old === undefined) fs.unlinkSync(change.target);
      else writeAtomic(change.target, change.old);
    }
    throw error;
  }
  return { written: changes.length, backup: fs.existsSync(backup) ? backup : null };
}
