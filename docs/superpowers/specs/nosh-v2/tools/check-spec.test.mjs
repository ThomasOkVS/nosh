import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpec } from './check-spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const okDir = path.join(here, 'fixtures', 'ok');
const ok = { repoDir: path.join(okDir, 'repo'), specDir: path.join(okDir, 'spec') };

// Copy the clean fixture to a temp dir, apply edits, run the checker.
function run(...edits) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-spec-'));
  try {
    fs.cpSync(okDir, tmp, { recursive: true });
    const ctx = { repoDir: path.join(tmp, 'repo'), specDir: path.join(tmp, 'spec') };
    for (const edit of edits) edit(ctx);
    return checkSpec(ctx);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const edit = (rel, fn) => (ctx) => {
  const p = path.join(ctx.specDir, rel);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
};
const one = (fn) => edit('one.md', fn);

const dropSection = (name) => one((t) => t.replace(new RegExp(`## ${name}\\n[^]*?(?=\\n## |$)`), ''));
const swapSections = () =>
  one((t) => t.replace('## Rationale\nNone.\n\n## Tests not carried\n- none', '## Tests not carried\n- none\n\n## Rationale\nNone.'));
const renameCriterion = (title) => one((t) => t.replace('### ONE-01 Works', `### ${title}`));
const setVerdict = (v) => one((t) => t.replace('| Works | keep |', `| Works | ${v} |`));
const addSource = (p) => one((t) => t.replace('## ADRs', `- \`${p}\`\n\n## ADRs`));
const removeCitation = (name) => one((t) => t.replace(new RegExp(`^Cites:.*${name}.*$`, 'm'), 'Cites: nothing'));
const appendCriterionText = (s) => one((t) => t.replace('**Then** c', `**Then** c ${s}`));
const addRepoFile = (rel) => (ctx) => {
  const p = path.join(ctx.repoDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '// fixture\n');
};
const setAside = (p) => edit('index.md', (t) => t.replace('## Set aside\n', `## Set aside\n- \`${p}\` — plumbing\n`));
const setAsideAdr = (h) => edit('index.md', (t) => t.replace('## Set aside\n', `## Set aside\n- ADR: ${h} — superseded\n`));
const addAdr = (heading) => (ctx) =>
  fs.appendFileSync(path.join(ctx.repoDir, 'docs', 'decisions.md'), `\n## ${heading}\n\nText.\n`);
// A second area file that reuses an ID (no sources, so it claims nothing).
const addFile = (name, id) => (ctx) =>
  fs.writeFileSync(
    path.join(ctx.specDir, name),
    fs
      .readFileSync(path.join(ctx.specDir, 'one.md'), 'utf8')
      .replace('### ONE-01 Works', `### ${id} Dup`)
      .replace(/^- `backend.*\n/gm, ''),
  );

test('clean fixture passes', () => assert.deepEqual(checkSpec(ok), []));
test('missing section', () => assert.match(run(dropSection('Rationale')).join('\n'), /^\[sections\] one\.md/m));
test('sections out of order', () => assert.match(run(swapSections()).join('\n'), /^\[sections\] one\.md/m));
test('bad id', () => assert.match(run(renameCriterion('ONE-1 Works')).join(), /\[id-format\]/));
test('id prefix differs from the others in the file', () =>
  assert.match(
    run(one((t) => t.replace('\n## Rationale', '\n### TWO-01 Other\n**Given** x\n\n## Rationale'))).join(),
    /\[id-format\] .*TWO-01/,
  ));
test('duplicate id across files', () => assert.match(run(addFile('two.md', 'ONE-01')).join(), /\[id-unique\] ONE-01/));
test('bad verdict', () => assert.match(run(setVerdict('maybe')).join(), /\[verdict\]/));
test('unclaimed source file', () =>
  assert.match(run(addRepoFile('backend/src/b.ts')).join(), /\[unclaimed-file\] backend\/src\/b\.ts/));
test('set-aside file is fine', () =>
  assert.deepEqual(run(addRepoFile('backend/src/b.ts'), setAside('backend/src/b.ts')), []));
test('dir/* claims everything below', () =>
  assert.deepEqual(run(addRepoFile('backend/src/sub/c.ts'), addSource('backend/src/sub/*')), []));
test('sibling test is implied and must be cited', () =>
  assert.match(
    run(addRepoFile('backend/src/d.ts'), addRepoFile('backend/src/d.test.ts'), addSource('backend/src/d.ts')).join(),
    /\[uncited-test\] backend\/src\/d\.test\.ts/,
  ));
test('listed path missing', () => assert.match(run(addSource('backend/src/nope.ts')).join(), /\[unknown-file\]/));
test('unclaimed ADR', () =>
  assert.match(run(addAdr('2026-02-02: Beta {#beta}')).join(), /\[unclaimed-adr\] 2026-02-02: Beta$/m));
test('set-aside ADR is fine, even when its heading contains an em dash', () =>
  assert.deepEqual(run(addAdr('2026-02-02: Beta — with dash'), setAsideAdr('2026-02-02: Beta — with dash')), []));
test('area ADR bullet with a pasted {#anchor} still matches', () =>
  assert.deepEqual(run(one((t) => t.replace('- 2026-01-01: Alpha', '- 2026-01-01: Alpha {#alpha}'))), []));
test('restart ADR exempt', () => assert.ok(!checkSpec(ok).some((l) => l.includes('restarted'))));
test('uncited test file', () =>
  assert.match(run(removeCitation('a.test.ts')).join(), /\[uncited-test\] backend\/src\/a\.test\.ts/));
test('banned word', () => assert.match(run(appendCriterionText('uses Express')).join(), /\[banned-word\] express/i));
test('planner criterion', () => assert.match(run(appendCriterionText('adds to the meal plan')).join(), /\[planner\]/));
