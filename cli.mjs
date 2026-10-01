#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, loadConfig, render, inspectCatalog, readBaseInstructions, defaultCodexHome, planInstall, applyInstall } from './src/router.mjs';

const HELP = `Codex task router (Node.js 22+)

node cli.mjs build   [--config routing.toml] [--out dist]
node cli.mjs doctor  [--config routing.toml] [--codex-home PATH] [--catalog PATH]
node cli.mjs install [--config routing.toml] [--codex-home PATH] [--apply]

build writes an isolated generated bundle; install previews by default.
--apply installs a separate profile, roles, skill, and managed AGENTS.md block.
The existing config.toml is never rewritten. Restart with codex -p task-routing.
Provider credentials stay in your existing Codex provider configuration.
`;

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, out: { type: 'string' }, 'codex-home': { type: 'string' },
    catalog: { type: 'string' }, apply: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
  } });
  const command = positionals[0];
  if (values.help || !command) { console.log(HELP); process.exit(0); }
  if (!['build', 'doctor', 'install'].includes(command) || positionals.length !== 1) throw new Error('Choose build, doctor, or install; use --help.');
  if (values.apply && command !== 'install') throw new Error('--apply is only valid with install');
  if (values.out && command !== 'build') throw new Error('--out is only valid with build');
  const c = loadConfig(path.resolve(values.config || path.join(ROOT, 'routing.toml')));
  const home = path.resolve(values['codex-home'] || defaultCodexHome());
  if (command === 'doctor') {
    const report = inspectCatalog(c, home, values.catalog);
    console.table(report.rows);
    for (const message of report.warnings) console.log(`UNVERIFIED: ${message}`);
    for (const message of report.errors) console.error(`ERROR: ${message}`);
    process.exitCode = report.errors.length ? 1 : 0;
  } else if (command === 'build') {
    const out = path.resolve(values.out || path.join(ROOT, 'dist'));
    if (out === home || out === ROOT || out === path.parse(out).root) throw new Error('Build into an isolated output directory; use install for Codex home.');
    const changes = planInstall(render(c), out);
    const result = applyInstall(changes, out);
    console.log(`Built ${render(c).size} artifacts in ${out} (${result.written} files updated).`);
  } else {
    const report = inspectCatalog(c, home, values.catalog);
    if (report.errors.length) throw new Error(report.errors.join('\n'));
    for (const message of report.warnings) console.log(`UNVERIFIED: ${message}`);
    const base = readBaseInstructions(home);
    const changes = planInstall(render(c, { baseInstructions: base.text }), home, { base });
    console.log(`Target: ${home}`);
    for (const change of changes) console.log(`${change.content === undefined ? 'DELETE' : change.old === undefined ? 'CREATE' : 'UPDATE'} ${change.relative}`);
    if (!changes.length) console.log('Already up to date.');
    if (values.apply) {
      const result = applyInstall(changes, home);
      console.log(`Installed ${result.written} files.${result.backup ? ` Backup: ${result.backup}` : ''}`);
      console.log(`Start a new session: codex -p ${c.profile}`);
    } else console.log('Preview only. Add --apply to install.');
  }
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
