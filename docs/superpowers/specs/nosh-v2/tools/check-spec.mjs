#!/usr/bin/env node
// Spec checker for docs/superpowers/specs/nosh-v2. Node built-ins only.
// Usage: node check-spec.mjs [--repo <dir>] [--spec <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTIONS = [
  'Purpose',
  'Sources',
  'ADRs',
  'Features',
  'Acceptance criteria',
  'Rationale',
  'Tests not carried',
  'Open questions for the owner',
];
const SCAN = [
  'backend/src',
  'backend/migrations',
  'frontend/src',
  'frontend/public',
  'packages/units/src',
  'frontend/vite.config.ts',
];
const BANNED = ['express', 'multer', 'cheerio', 'node-pg-migrate', 'connect-pg-simple', 'express-session', 'nginx', 'pg Pool'];
const VERDICTS = new Set(['keep', 'drop', 'owner?']);
const RESTART_ADR = '2026-11-24: nosh is restarted from scratch';
const NON_AREA = new Set(['index.md', '_template.md']);

const slash = (p) => p.split(path.sep).join('/');
const isTest = (f) => /\.test\.tsx?$/.test(f);
const stripAnchor = (h) => h.replace(/\s*\{#[^}]*\}\s*$/, '').trim();

// Split markdown into [{ heading, lines }] at lines starting with `prefix`
// (e.g. "## "), ignoring fenced code blocks. Text before the first heading is dropped.
function splitByHeading(lines, prefix) {
  const out = [];
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && line.startsWith(prefix)) out.push({ heading: line.slice(prefix.length).trim(), lines: [] });
    else if (out.length) out.at(-1).lines.push(line);
  }
  return out;
}

const readLines = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/);
const bullets = (lines) => lines.filter((l) => /^\s*- /.test(l)).map((l) => l.replace(/^\s*- /, '').trim());
const firstBackticked = (s) => s.match(/`([^`]+)`/)?.[1];

function walk(repoDir) {
  const files = [];
  for (const entry of SCAN) {
    const abs = path.join(repoDir, entry);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isFile()) {
      files.push(entry);
      continue;
    }
    for (const rel of fs.readdirSync(abs, { recursive: true })) {
      if (fs.statSync(path.join(abs, rel)).isFile()) files.push(slash(`${entry}/${rel}`));
    }
  }
  return files.sort();
}

// Does `entry` (a Sources/Set aside path) claim `file`?
function claims(entry, file) {
  if (entry.endsWith('/*')) return file.startsWith(entry.slice(0, -1));
  if (entry === file) return true;
  const m = entry.match(/^(.*)\.(tsx?)$/);
  return Boolean(m) && !isTest(entry) && file === `${m[1]}.test.${m[2]}`;
}

function parseArea(file) {
  const sections = splitByHeading(readLines(file), '## ');
  const byName = new Map(sections.map((s) => [s.heading, s.lines]));
  const lines = (name) => byName.get(name) ?? [];
  return { sections, lines, text: (name) => lines(name).join('\n') };
}

function parseSetAside(indexFile, decisionHeadings) {
  const paths = [];
  const adrs = [];
  if (!fs.existsSync(indexFile)) return { paths, adrs };
  const section = splitByHeading(readLines(indexFile), '## ').find((s) => s.heading === 'Set aside');
  for (const b of bullets(section?.lines ?? [])) {
    if (b.startsWith('ADR: ')) {
      const rest = b.slice(5);
      // Headings may themselves contain " — ": prefer a split that yields a known heading, else the last one.
      const cuts = [...rest.matchAll(/ — /g)].map((m) => m.index);
      const known = cuts.map((i) => rest.slice(0, i).trim()).find((h) => decisionHeadings.has(h));
      adrs.push(known ?? (cuts.length ? rest.slice(0, cuts.at(-1)).trim() : rest.trim()));
    } else {
      const p = firstBackticked(b);
      if (p) paths.push(p);
    }
  }
  return { paths, adrs };
}

export function checkSpec({ repoDir, specDir }) {
  const problems = [];
  const repoFiles = walk(repoDir);
  const repoSet = new Set(repoFiles);
  const exists = (entry) =>
    entry.endsWith('/*') ? repoFiles.some((f) => f.startsWith(entry.slice(0, -1))) : fs.existsSync(path.join(repoDir, entry));

  const decisionsFile = path.join(repoDir, 'docs', 'decisions.md');
  const decisionHeadings = new Set();
  if (fs.existsSync(decisionsFile)) {
    for (const s of splitByHeading(readLines(decisionsFile), '## ')) decisionHeadings.add(stripAnchor(s.heading));
  }

  const setAside = parseSetAside(path.join(specDir, 'index.md'), decisionHeadings);
  const areaFiles = fs.existsSync(specDir)
    ? fs.readdirSync(specDir).filter((f) => f.endsWith('.md') && !NON_AREA.has(f)).sort()
    : [];

  const claimed = [...setAside.paths];
  const claimedAdrs = new Set(setAside.adrs);
  const idOwners = new Map();
  let criteriaCount = 0;

  for (const entry of setAside.paths) {
    if (!exists(entry)) problems.push(`[unknown-file] index.md Set aside lists ${entry}`);
  }

  for (const name of areaFiles) {
    const area = parseArea(path.join(specDir, name));

    // sections: all eight, in order
    const present = area.sections.map((s) => s.heading).filter((h) => SECTIONS.includes(h));
    const missing = SECTIONS.filter((s) => !present.includes(s));
    if (missing.length) problems.push(`[sections] ${name} missing: ${missing.join(', ')}`);
    else if (present.join('|') !== SECTIONS.join('|')) problems.push(`[sections] ${name} sections out of order`);

    // sources
    const sources = bullets(area.lines('Sources')).map(firstBackticked).filter(Boolean);
    claimed.push(...sources);
    for (const s of sources) {
      if (!exists(s)) problems.push(`[unknown-file] ${name} Sources lists ${s}`);
    }

    // ADRs
    for (const h of bullets(area.lines('ADRs'))) claimedAdrs.add(stripAnchor(h));

    // features: verdict column
    const rows = area.lines('Features').filter((l) => l.trim().startsWith('|'));
    for (const row of rows.slice(2)) {
      const cells = row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!VERDICTS.has(cells[1] ?? '')) {
        problems.push(`[verdict] ${name} "${cells[0]}" has verdict "${cells[1] ?? ''}" (keep, drop or owner?)`);
      }
    }

    // acceptance criteria
    let filePrefix;
    for (const c of splitByHeading(area.lines('Acceptance criteria'), '### ')) {
      criteriaCount++;
      const m = c.heading.match(/^([A-Z]+)-(\d{2}) \S/);
      const id = c.heading.split(/\s/)[0];
      if (!m) {
        problems.push(`[id-format] ${name} "${c.heading}"`);
      } else {
        filePrefix ??= m[1];
        if (m[1] !== filePrefix) problems.push(`[id-format] ${name} "${c.heading}" prefix differs from ${filePrefix}`);
      }
      const owners = idOwners.get(id) ?? [];
      owners.push(name);
      idOwners.set(id, owners);

      const body = `${c.heading}\n${c.lines.join('\n')}`;
      for (const word of BANNED) {
        if (new RegExp(`(?<![\\w-])${word}(?![\\w-])`, 'i').test(body)) problems.push(`[banned-word] ${word} in ${name} ${id}`);
      }
      if (/meal plan|planner/i.test(body)) problems.push(`[planner] ${name} ${id} mentions the planner`);
    }

    // tests in this area's Sources must be cited
    const cited = `${area.text('Acceptance criteria')}\n${area.text('Tests not carried')}`;
    for (const f of repoFiles.filter(isTest)) {
      if (sources.some((s) => claims(s, f)) && !cited.includes(f)) {
        problems.push(`[uncited-test] ${f} (${name}) is not cited in Acceptance criteria or Tests not carried`);
      }
    }
  }

  for (const [id, owners] of idOwners) {
    if (owners.length > 1) problems.push(`[id-unique] ${id} appears ${owners.length} times (${owners.join(', ')})`);
  }

  for (const f of repoFiles) {
    if (!claimed.some((c) => claims(c, f))) problems.push(`[unclaimed-file] ${f}`);
  }

  for (const h of decisionHeadings) {
    if (h !== RESTART_ADR && !claimedAdrs.has(h)) problems.push(`[unclaimed-adr] ${h}`);
  }

  checkSpec.lastStats = { areas: areaFiles.length, criteria: criteriaCount };
  return problems;
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
  const repoDir = path.resolve(opt('--repo', process.cwd()));
  const specDir = path.resolve(opt('--spec', path.join(repoDir, 'docs/superpowers/specs/nosh-v2')));
  const problems = checkSpec({ repoDir, specDir });
  if (problems.length === 0) {
    const { areas, criteria } = checkSpec.lastStats;
    console.log(`spec OK: ${areas} areas, ${criteria} criteria`);
  } else {
    console.log(problems.join('\n'));
    process.exitCode = 1;
  }
}
