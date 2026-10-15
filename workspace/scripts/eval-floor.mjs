#!/usr/bin/env node
/**
 * Measures the runner's similarity floor against the live materials store (read-only).
 *
 * For each floor it runs the materials package's batch entry (`mcp-server/dist/batch.js`) once per
 * query, as the runner does, and prints counts and similarities only: never a passage, never the key.
 *
 *   (a) the golden set (`ingest/eval/golden_set.json`): is a truth file among the hits? Case 7's truth
 *       names files that were replaced; 2509 and 2773 count for it separately ("with replacements").
 *   (b) questions that must find nothing (the acceptance pack's step 8 question, three more strings of
 *       invented words, three unrelated real-English questions): how many hits came back (any hit makes
 *       the runner store `found`) and the best hit's similarity.
 *
 * Environment:
 *   SUPABASE_SERVICE_ROLE_FILE  path of the file holding the service key (required; the key is read
 *                               by batch.js, never by this script)
 *   SUPABASE_URL                defaults to the bb2dash project
 *   EVAL_FLOORS                 comma-separated floors, default 0.78,0.80,0.81,0.82
 *
 * Build the package first (`cd mcp-server && npm ci && npm run build`), then from the repository root:
 *   SUPABASE_SERVICE_ROLE_FILE=C:/Users/stack/.bb2dash-secrets/bb2dash_mcp_service_key \
 *     node workspace/scripts/eval-floor.mjs
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const BATCH_ENTRY = resolve(REPO, 'mcp-server', 'dist', 'batch.js');
const GOLDEN_SET = resolve(REPO, 'ingest', 'eval', 'golden_set.json');
const DEFAULT_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
const DEFAULT_FLOORS = [0.78, 0.8, 0.81, 0.82];
const PER_QUERY_LIMIT = 10;
const CHILD_TIMEOUT_MS = 30_000;
/** Case 7's truth files were replaced; these are the replacements. */
const REPLACEMENTS = Object.freeze({ 7: Object.freeze([2509, 2773]) });

/** Must return nothing. The first is `QUESTION_NOTHING` in `web/e2e/accept24.spec.ts`. */
const NOTHING_QUESTIONS = Object.freeze([
  { label: 'pack step 8 (gibberish)', q: 'What is a zxqvl blorptangle wumbaflix frennodyne?' },
  { label: 'gibberish 2', q: 'How does the kreebish oonflat dromble a sneevish taplorn?' },
  { label: 'gibberish 3', q: 'Plonkish vurtle snagberries quoff the mardlewisp' },
  { label: 'gibberish 4', q: 'xqzv bramflet ortulox pindrive yembrock' },
  { label: 'unrelated 1', q: 'What is the capital of France?' },
  { label: 'unrelated 2', q: 'How do I change a flat tire on a bicycle?' },
  { label: 'unrelated 3', q: 'Who won the 1998 FIFA World Cup?' },
]);

function readFloors() {
  const raw = process.env.EVAL_FLOORS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_FLOORS;
  const floors = raw.split(',').map((part) => Number(part.trim()));
  if (floors.some((floor) => !Number.isFinite(floor) || floor < 0 || floor > 1)) {
    throw new Error('EVAL_FLOORS must be comma-separated numbers between 0 and 1');
  }
  return floors;
}

function childEnv() {
  const keyFile = process.env.SUPABASE_SERVICE_ROLE_FILE;
  if (keyFile === undefined || keyFile.trim() === '') {
    throw new Error('SUPABASE_SERVICE_ROLE_FILE must name the file that holds the service key');
  }
  return {
    PATH: process.env.PATH ?? '',
    SUPABASE_URL: process.env.SUPABASE_URL ?? DEFAULT_URL,
    SUPABASE_SERVICE_ROLE_FILE: keyFile,
  };
}

/** One batch call with one query; resolves to that query's answer. */
function search(env, q, courses, floor) {
  const body = JSON.stringify({
    version: 1,
    queries: [{ q, kinds: ['material'], courses }],
    limit: PER_QUERY_LIMIT,
    min_similarity: floor,
    attachments: [],
  });
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [BATCH_ENTRY], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let stderrBytes = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), CHILD_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`batch.js exited ${code} (stderr ${stderrBytes} bytes, not shown)`));
        return;
      }
      try {
        const answer = JSON.parse(Buffer.concat(out).toString('utf8'));
        resolvePromise(answer.queries[0]);
      } catch {
        reject(new Error('batch.js wrote something that is not an answer'));
      }
    });
    child.stdin.end(body);
  });
}

function summarize(answer, floor) {
  const sims = answer.hits.map((hit) => hit.similarity).filter((sim) => typeof sim === 'number');
  return {
    state: answer.state,
    hits: answer.hits.length,
    atFloor: sims.filter((sim) => sim >= floor).length,
    best: sims.length === 0 ? null : Math.max(...sims),
    fileIds: answer.hits.map((hit) => hit.file_id),
  };
}

const fmt = (value) => (value === null ? '-' : value.toFixed(3));
const stateNote = (state) => (state === 'ok' ? '' : ` ${state}`);

async function measureGolden(env, floors, golden, totals) {
  console.log('(a) golden set: truth file among the hits [hits / best similarity]');
  for (const testCase of golden) {
    const cells = [];
    for (const [index, floor] of floors.entries()) {
      const result = summarize(await search(env, testCase.query, [testCase.course], floor), floor);
      const strict = testCase.truth.file_ids.some((id) => result.fileIds.includes(id));
      const replaced = (REPLACEMENTS[testCase.qid] ?? []).some((id) => result.fileIds.includes(id));
      if (strict) totals[index].strict += 1;
      if (strict || replaced) totals[index].withReplacements += 1;
      const mark = strict ? 'HIT' : replaced ? 'HIT(repl)' : 'miss';
      cells.push(`${floor.toFixed(2)}: ${mark} [${result.hits} / ${fmt(result.best)}]${stateNote(result.state)}`);
    }
    console.log(`  case ${testCase.qid} (${testCase.course}): ${cells.join(' | ')}`);
  }
}

async function measureNothing(env, floors, totals) {
  console.log('(b) must find nothing: hits (of them at or above the floor) / best similarity');
  for (const question of NOTHING_QUESTIONS) {
    const cells = [];
    for (const [index, floor] of floors.entries()) {
      const result = summarize(await search(env, question.q, null, floor), floor);
      if (result.state === 'ok' && result.hits === 0) totals[index].nothingEmpty += 1;
      cells.push(`${floor.toFixed(2)}: ${result.hits} (${result.atFloor}) / ${fmt(result.best)}${stateNote(result.state)}`);
    }
    console.log(`  ${question.label} "${question.q}": ${cells.join(' | ')}`);
  }
}

async function main() {
  const env = childEnv();
  const floors = readFloors();
  const golden = JSON.parse(readFileSync(GOLDEN_SET, 'utf8'));
  const totals = floors.map(() => ({ strict: 0, withReplacements: 0, nothingEmpty: 0 }));

  await measureGolden(env, floors, golden, totals);
  await measureNothing(env, floors, totals);

  console.log('totals');
  for (const [index, floor] of floors.entries()) {
    const total = totals[index];
    console.log(
      `  ${floor.toFixed(2)}: golden ${total.strict}/${golden.length} strict, ${total.withReplacements}/${golden.length} with replacements; ` +
        `must-find-nothing empty ${total.nothingEmpty}/${NOTHING_QUESTIONS.length}`,
    );
  }
}

main().catch((error) => {
  console.error(`eval-floor: ${error instanceof Error ? error.message : 'failed'}`);
  process.exitCode = 1;
});
