// bb2dash :: ingest/fetch_signed.test.mjs
//
//   node --test ingest/fetch_signed.test.mjs
//
// Covers the byte fetch that replaces the browser download event (Phase 18 task 2). The download
// event crashed the MCP browser on 2026-09-23 and the bytes had to be fetched by hand from the
// signed CDN link at the end of the bbcswebdav redirect chain; this module walks that chain itself.
//
// The decisions under test are the ones that, wrong, would either fetch nothing or fetch from
// somewhere it should not: the hop ceiling, the final-host allowlist, the three failure outcomes a
// caller must tell apart (an expired session, a file that is gone, a chain it refuses to follow)
// and the cross-device rename that a tmpfs download hits.
//
// Importing the module must run nothing: the suite finishing asserts that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BLACKBOARD_ORIGIN,
  MAX_HOPS,
  LOGIN_HOSTS,
  SIGNED_HOST_SUFFIX,
  UNIVERSITY_DOMAINS,
  classifyRedirectTarget,
  downloadTo,
  isFollowable,
  isSignedHost,
  resolveSignedUrl,
  validateHops,
} from './fetch_signed.mjs';

const DURABLE = 'https://blackboard.syracuse.edu/bbcswebdav/pid-1-dt-content-rid-2_1/xid-3_1';
const SIGNED = `https://eu.content.blackboardcdn.com/abc/Report.pdf?X-Amz-Signature=deadbeef`;

/** A `get` double: a map of url -> {status, headers}. Records the order it was called in. */
function fakeGet(byUrl, calls = []) {
  return async (url) => {
    calls.push(url);
    const answer = byUrl[url];
    if (!answer) throw new Error(`unexpected get: ${url}`);
    return answer;
  };
}

const redirect = (to) => ({ status: 302, headers: { location: to } });
const ok = () => ({ status: 200, headers: {} });

test('isSignedHost accepts the CDN suffix and nothing else', () => {
  assert.equal(isSignedHost(SIGNED), true);
  assert.equal(isSignedHost('https://content.blackboardcdn.com/x'), true);
  assert.equal(isSignedHost('https://evil.com/x'), false);
  // A look-alike host that merely ends with the suffix as a substring, not a domain boundary.
  assert.equal(isSignedHost('https://notcontent.blackboardcdn.com.evil.com/x'), false);
  assert.equal(isSignedHost('not a url'), false);
});

test('SIGNED_HOST_SUFFIX and MAX_HOPS are the documented values', () => {
  assert.equal(SIGNED_HOST_SUFFIX, '.content.blackboardcdn.com');
  assert.equal(MAX_HOPS, 3);
});

test('validateHops accepts a 2-hop chain ending on the CDN', () => {
  assert.deepEqual(validateHops([DURABLE, SIGNED]), { outcome: 'ok', signedUrl: SIGNED });
});

test('validateHops accepts a 3-hop chain', () => {
  const mid = 'https://blackboard.syracuse.edu/webapps/blackboard/redirect';
  assert.deepEqual(validateHops([DURABLE, mid, SIGNED]), { outcome: 'ok', signedUrl: SIGNED });
});

test('validateHops refuses a 4th hop', () => {
  const chain = [DURABLE, 'https://a.syr.edu/1', 'https://b.syr.edu/2', SIGNED];
  const got = validateHops(chain);
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /hop/i);
});

test('validateHops refuses a final host outside the CDN suffix', () => {
  const got = validateHops([DURABLE, 'https://files.example.com/Report.pdf']);
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /host/i);
});

test('validateHops names the refused final host, and only the host (164)', () => {
  const got = validateHops([DURABLE, 'https://files.example.com/Report.pdf?X-Amz-Signature=deadbeef']);
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /files\.example\.com/);
  assert.doesNotMatch(got.reason, /deadbeef|Report\.pdf/);
});

test('validateHops refuses an empty or single-hop chain', () => {
  assert.equal(validateHops([]).outcome, 'refused');
  assert.equal(validateHops([DURABLE]).outcome, 'refused');
});

test('resolveSignedUrl walks a 2-hop chain one hop at a time', async () => {
  const calls = [];
  const get = fakeGet({ [DURABLE]: redirect(SIGNED), [SIGNED]: ok() }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.deepEqual(got, { outcome: 'ok', signedUrl: SIGNED, hops: [DURABLE, SIGNED] });
  // One hop at a time: the durable URL is asked for first, and the signed URL is never re-fetched
  // by the resolver (downloadTo fetches the bytes).
  assert.deepEqual(calls, [DURABLE]);
});

test('resolveSignedUrl reports session_expired on a 401 or 403 at the first hop', async () => {
  for (const status of [401, 403]) {
    const get = fakeGet({ [DURABLE]: { status, headers: {} } });
    const got = await resolveSignedUrl(get, DURABLE);
    assert.equal(got.outcome, 'session_expired', `status ${status}`);
  }
});

test('resolveSignedUrl reports gone on a 404', async () => {
  const get = fakeGet({ [DURABLE]: { status: 404, headers: {} } });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'gone');
});

test('resolveSignedUrl refuses a chain that never reaches the CDN', async () => {
  const a = 'https://blackboard.syracuse.edu/1';
  const b = 'https://blackboard.syracuse.edu/2';
  const c = 'https://blackboard.syracuse.edu/3';
  const get = fakeGet({ [DURABLE]: redirect(a), [a]: redirect(b), [b]: redirect(c) });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
});

test('resolveSignedUrl resolves a relative Location against the hop it came from', async () => {
  const rel = '/bbcswebdav/next';
  const abs = 'https://blackboard.syracuse.edu/bbcswebdav/next';
  const get = fakeGet({ [DURABLE]: redirect(rel), [abs]: redirect(SIGNED) });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'ok');
  assert.deepEqual(got.hops, [DURABLE, abs, SIGNED]);
});

test('resolveSignedUrl treats a 200 before the CDN as refused, not ok', async () => {
  // Blackboard answering the durable URL with an HTML login page is a 200 that is not the file.
  const get = fakeGet({ [DURABLE]: ok() });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
});

test('downloadTo writes through a temp file and renames into place', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  const body = Buffer.from('%PDF-1.7 hello');
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => body });
  const got = await downloadTo(fetchImpl, SIGNED, dest);
  assert.equal(got.outcome, 'ok');
  assert.equal(got.bytes, body.length);
  assert.deepEqual(fs.readFileSync(dest), body);
  // No temp file is left behind.
  assert.deepEqual(fs.readdirSync(dir), ['out.pdf']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('downloadTo falls back to copy-then-unlink when rename raises EXDEV', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  const body = Buffer.from('%PDF-1.7 across devices');
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => body });
  const realRename = fs.renameSync;
  let raised = false;
  fs.renameSync = () => { raised = true; const e = new Error('cross-device link'); e.code = 'EXDEV'; throw e; };
  try {
    const got = await downloadTo(fetchImpl, SIGNED, dest);
    assert.equal(raised, true);
    assert.equal(got.outcome, 'ok');
    assert.deepEqual(fs.readFileSync(dest), body);
    assert.deepEqual(fs.readdirSync(dir), ['out.pdf']);
  } finally {
    fs.renameSync = realRename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadTo calls a CDN 401/403 an expired signature, not a dead session', async () => {
  // The signed URL carries no cookie, so the CDN refusing it says nothing about Blackboard. Calling
  // it session_expired would abort the whole run on a stale signature.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  for (const [status, outcome] of [[401, 'refused'], [403, 'refused'], [404, 'gone']]) {
    const fetchImpl = async () => ({ ok: false, status, arrayBuffer: async () => Buffer.alloc(0) });
    const got = await downloadTo(fetchImpl, SIGNED, dest);
    assert.equal(got.outcome, outcome, `status ${status}`);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('downloadTo refuses a url outside the CDN suffix without fetching', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('should not be called'); };
  const got = await downloadTo(fetchImpl, 'https://evil.com/x.pdf', dest);
  assert.equal(got.outcome, 'refused');
  assert.equal(called, false);
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// The walk is gated, not just its endpoint (security review, finding 1).
//
// Every hop is fetched by Playwright's request context, which carries the logged-in profile's
// cookies. The final-host check alone did not stop the walk from being pointed at an arbitrary
// origin: `source_url` comes from `data-bbfile` attributes in course content, and the crawler's
// durableUrl falls back to any URL string when no bbcswebdav pattern matches. So a course-content
// author could aim a credentialed GET at localhost or any internal host and read the outcome back
// as a status oracle. Nothing is fetched now unless its origin is allowed.
// ---------------------------------------------------------------------------------------------

test('isFollowable allows Blackboard and the CDN over https, and nothing else', () => {
  assert.equal(isFollowable(DURABLE), true);
  assert.equal(isFollowable(SIGNED), true);
  assert.equal(isFollowable('https://blackboard.syracuse.edu/webapps/x'), true);
  assert.equal(isFollowable('http://blackboard.syracuse.edu/webapps/x'), false, 'cleartext is refused');
  assert.equal(isFollowable('https://evil.com/x'), false);
  assert.equal(isFollowable('https://blackboard.syracuse.edu.evil.com/x'), false);
  assert.equal(isFollowable('not a url'), false);
});

test('isFollowable refuses loopback, private and link-local hosts outright', () => {
  for (const u of [
    'http://127.0.0.1:8080/admin',
    'https://127.0.0.1/admin',
    'https://localhost/admin',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://172.16.0.1/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/x',
  ]) {
    assert.equal(isFollowable(u), false, u);
  }
});

test('BLACKBOARD_ORIGIN is the institution host the walk starts from', () => {
  assert.equal(BLACKBOARD_ORIGIN, 'blackboard.syracuse.edu');
});

test('resolveSignedUrl refuses a starting URL off Blackboard without fetching it', async () => {
  let called = false;
  const get = async () => { called = true; throw new Error('should not be called'); };
  const got = await resolveSignedUrl(get, 'http://127.0.0.1:8080/admin/shutdown');
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /not followable|origin/i);
  assert.equal(called, false, 'no credentialed request is issued at all');
});

test('resolveSignedUrl never fetches a redirect to an off-origin host; it reports it as offsite (164)', async () => {
  const calls = [];
  const evil = 'https://evil.com/collect';
  const get = fakeGet({ [DURABLE]: redirect(evil) }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  // Before 164 this was `refused`. A redirect to another site is now a link to save, not an error;
  // the walk still never sends the logged-in session there.
  assert.equal(got.outcome, 'offsite');
  assert.equal(got.target, evil);
  assert.deepEqual(calls, [DURABLE], 'the off-origin hop is never requested');
});

test('resolveSignedUrl refuses a redirect to loopback', async () => {
  const calls = [];
  const get = fakeGet({ [DURABLE]: redirect('http://127.0.0.1:9000/x') }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
  assert.deepEqual(calls, [DURABLE]);
});

test('downloadTo refuses a cleartext CDN url', async () => {
  const fetchImpl = async () => { throw new Error('should not be called'); };
  const got = await downloadTo(fetchImpl, 'http://eu.content.blackboardcdn.com/x.pdf', '/tmp/x.pdf');
  assert.equal(got.outcome, 'refused');
});

// ---------------------------------------------------------------------------------------------
// 164: a Blackboard file whose link redirects to another SITE is saved as a link, not an error.
//
// Three outcomes for a redirect the walk will not follow, told apart by `classifyRedirectTarget`:
//   outside   -> `offsite` with the target (never requested; the caller stores the link)
//   blackboard-> `refused`, the HOST named (Blackboard's file, its bytes still owed; widening the
//                allow-list is a separate, reviewed change)
//   unusable  -> `refused` (an IP, localhost, a non-http(s) scheme, credentials, too long, ...)
// A reason names the host only: a CDN URL carries a signature.
// ---------------------------------------------------------------------------------------------

test('classifyRedirectTarget: another site is outside', () => {
  for (const u of [
    'https://www.cbo.gov/system/files/2024/report.pdf',
    'http://newyorkfed.org/x',
    'https://example.com/a?b=c#d',
    'https://blackboard.syracuse.edu.evil.example/x',
    'https://notblackboard.com/x',
    'https://drive.google.com/file/d/abc/view',
  ]) {
    assert.equal(classifyRedirectTarget(u), 'outside', u);
  }
});

test('classifyRedirectTarget: a Blackboard host not on the allow-list is blackboard, never outside', () => {
  for (const u of [
    'http://blackboard.syracuse.edu/x',
    'https://other.blackboard.syracuse.edu/x',
    'https://us-east-1.content.blackboardcdn.com/x',
    'https://learn.blackboardcdn.com/x',
    'https://blackboardcdn.com/x',
    'https://help.blackboard.com/x',
    'https://blackboard.com/x',
    'https://BLACKBOARD.com/x',
  ]) {
    assert.equal(classifyRedirectTarget(u), 'blackboard', u);
  }
});

test('classifyRedirectTarget: a sign-in or university host is login, never outside (a dead session is not a link)', () => {
  for (const u of [
    'https://login.microsoftonline.com/common/oauth2/authorize?client_id=x',
    'https://login.microsoftonline.com/tenant/saml2?SAMLRequest=abc',
    'https://x.login.microsoftonline.com/y',
    'https://syracuse.edu/x',
    'https://shib.syracuse.edu/idp/x',
    'https://www.syr.edu/x',
    'http://sso.syr.edu/x',
  ]) {
    assert.equal(classifyRedirectTarget(u), 'login', u);
  }
  assert.deepEqual([...LOGIN_HOSTS], ['login.microsoftonline.com']);
  assert.deepEqual([...UNIVERSITY_DOMAINS], ['syracuse.edu', 'syr.edu']);
  // Look-alikes are other sites.
  assert.equal(classifyRedirectTarget('https://notsyracuse.edu/x'), 'outside');
  assert.equal(classifyRedirectTarget('https://syracuse.edu.evil.example/x'), 'outside');
  assert.equal(classifyRedirectTarget('https://login.microsoftonline.com.evil.example/x'), 'outside');
  // Blackboard's own host stays 'blackboard', ahead of the university rule.
  assert.equal(classifyRedirectTarget('https://other.blackboard.syracuse.edu/x'), 'blackboard');
});

test("classifyRedirectTarget: anthology.com is Blackboard's parent company, so it is blackboard", () => {
  for (const u of ['https://anthology.com/x', 'https://help.anthology.com/x', 'https://ANTHOLOGY.com/x']) {
    assert.equal(classifyRedirectTarget(u), 'blackboard', u);
  }
  assert.equal(classifyRedirectTarget('https://notanthology.com/x'), 'outside');
});

test('classifyRedirectTarget: a signed URL is not a link', () => {
  for (const q of [
    'X-Amz-Signature=beef&X-Amz-Expires=60',
    'x-amz-credential=abc',
    'X-Goog-Signature=beef',
    'SIGNATURE=beef',
    'a=1&sig=beef',
    'sv=1&se=2026-10-14&sp=r',
    'sp=r&x=1&se=2026',
    'Key-Pair-Id=K1',
    'Policy=abc',
    'token=abc',
    'Access_Token=abc',
    'Expires=1&Signature=beef',
  ]) {
    assert.equal(classifyRedirectTarget('https://example.org/f.pdf?' + q), 'signed', q);
  }
  for (const q of ['se=1', 'sp=r', 'Expires=1', 'page=sig', 'x=1&y=2', 'tokens=1', 'design=1']) {
    assert.equal(classifyRedirectTarget('https://example.org/f.pdf?' + q), 'outside', q);
  }
  assert.equal(classifyRedirectTarget('https://example.org/f.pdf'), 'outside');
});

test('resolveSignedUrl: a redirect to a sign-in page is refused with the host named, never offsite', async () => {
  const cases = [
    ['https://login.microsoftonline.com/common/oauth2/authorize?client_id=x&state=secret', 'login.microsoftonline.com'],
    ['https://shib.syracuse.edu/idp/profile/SAML2/Redirect/SSO?SAMLRequest=abc', 'shib.syracuse.edu'],
  ];
  for (const [to, host] of cases) {
    const calls = [];
    const get = fakeGet({ [DURABLE]: redirect(to) }, calls);
    const got = await resolveSignedUrl(get, DURABLE);
    assert.equal(got.outcome, 'refused', host);
    assert.ok(got.reason.includes(host), got.reason);
    assert.doesNotMatch(got.reason, /secret|SAMLRequest|client_id/);
    assert.deepEqual(calls, [DURABLE]);
  }
});

test("resolveSignedUrl: Blackboard's own login page redirecting to Microsoft is refused, not saved", async () => {
  const login = 'https://blackboard.syracuse.edu/webapps/login/';
  const saml = 'https://login.microsoftonline.com/tenant/saml2?SAMLRequest=abc';
  const get = fakeGet({ [DURABLE]: redirect(login), [login]: redirect(saml) });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
  assert.ok(got.reason.includes('login.microsoftonline.com'), got.reason);
});

test('resolveSignedUrl: a redirect to a signed URL elsewhere is refused with the host named', async () => {
  const get = fakeGet({ [DURABLE]: redirect('https://files.example.org/f.pdf?X-Amz-Signature=beef') });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
  assert.ok(got.reason.includes('files.example.org'), got.reason);
  assert.doesNotMatch(got.reason, /beef|X-Amz/);
});

test('classifyRedirectTarget: an unusable target is unusable', () => {
  for (const u of [
    'ftp://example.com/x',
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    'https://127.0.0.1/x',
    'https://10.0.0.5/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/x',
    'https://2130706433/x',
    'https://0x7f.1/x',
    'https://localhost/x',
    'https://app.localhost/x',
    'https://intranet/x',
    'https://user:secret@example.com/x',
    'https://user@example.com/x',
    `https://example.com/${'a'.repeat(2048)}`,
    'https://example.com/a b',
    'https://example.com/a\tb',
    'https://example.com/a\nb',
    'https://example.com/a\u0000b',
    'not a url',
    '',
    null,
    undefined,
  ]) {
    assert.equal(classifyRedirectTarget(u), 'unusable', String(u).slice(0, 60));
  }
});

test('classifyRedirectTarget: 2048 characters is the longest it accepts', () => {
  const base = 'https://example.com/';
  assert.equal(classifyRedirectTarget(base + 'a'.repeat(2048 - base.length)), 'outside');
  assert.equal(classifyRedirectTarget(base + 'a'.repeat(2049 - base.length)), 'unusable');
});

test('resolveSignedUrl: a redirect to another site is offsite, carries the target, and is never requested', async () => {
  const calls = [];
  const target = 'https://www.cbo.gov/system/files/report.pdf?page=2';
  const get = fakeGet({ [DURABLE]: redirect(target) }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'offsite');
  assert.equal(got.target, target);
  assert.deepEqual(got.hops, [DURABLE, target]);
  assert.deepEqual(calls, [DURABLE], 'the walk carries Blackboard cookies and never goes there');
});

test('resolveSignedUrl: an offsite redirect met after a Blackboard hop is still offsite', async () => {
  const mid = 'https://blackboard.syracuse.edu/webapps/blackboard/redirect';
  const target = 'https://www.sec.gov/files/a.pdf';
  const calls = [];
  const get = fakeGet({ [DURABLE]: redirect(mid), [mid]: redirect(target) }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'offsite');
  assert.equal(got.target, target);
  assert.deepEqual(calls, [DURABLE, mid]);
});

test('resolveSignedUrl: a relative-looking or protocol-relative Location off site is offsite', async () => {
  const get = fakeGet({ [DURABLE]: redirect('//www.cbo.gov/x.pdf') });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'offsite');
  assert.equal(got.target, 'https://www.cbo.gov/x.pdf');
});

test('resolveSignedUrl: a redirect to a Blackboard host off the allow-list is refused, naming the host only', async () => {
  const calls = [];
  const odd = 'https://learn.blackboardcdn.com/files/secret.pdf?X-Amz-Signature=deadbeef';
  const get = fakeGet({ [DURABLE]: redirect(odd) }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /learn\.blackboardcdn\.com/);
  assert.doesNotMatch(got.reason, /deadbeef|X-Amz|secret\.pdf/, 'the signed part of the URL stays out of a reason');
  assert.deepEqual(calls, [DURABLE]);
});

test('resolveSignedUrl: a redirect to an IP, localhost or a non-http scheme stays refused, not offsite', async () => {
  for (const to of [
    'http://127.0.0.1:9000/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/x',
    'https://localhost/x',
    'ftp://example.com/x',
    'https://user:pw@example.com/x',
  ]) {
    const calls = [];
    const get = fakeGet({ [DURABLE]: redirect(to) }, calls);
    const got = await resolveSignedUrl(get, DURABLE);
    assert.equal(got.outcome, 'refused', to);
    assert.deepEqual(calls, [DURABLE], to);
    assert.doesNotMatch(got.reason, /pw|user:/, 'credentials in a target never reach a reason');
  }
});

test('resolveSignedUrl: no redirect at all is still flagged, never offsite', async () => {
  for (const [answer, outcome] of [
    [{ status: 404, headers: {} }, 'gone'],
    [{ status: 200, headers: {} }, 'refused'],
    [{ status: 403, headers: {} }, 'session_expired'],
    [{ status: 302, headers: {} }, 'refused'],
  ]) {
    const got = await resolveSignedUrl(fakeGet({ [DURABLE]: answer }), DURABLE);
    assert.equal(got.outcome, outcome);
  }
  const failing = async () => { throw new Error('socket hang up'); };
  assert.equal((await resolveSignedUrl(failing, DURABLE)).outcome, 'refused');
});

test('resolveSignedUrl: a Blackboard-served chain to the CDN is unchanged', async () => {
  const get = fakeGet({ [DURABLE]: redirect(SIGNED), [SIGNED]: ok() });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.deepEqual(got, { outcome: 'ok', signedUrl: SIGNED, hops: [DURABLE, SIGNED] });
});

// Sync 5370 (2026-10-14): six files came back "not a usable link" and the report named nothing. A
// long signed address on a Blackboard content host was judged by its length before its host, so the
// one fact needed (which host) was lost. The host decides first; the length matters only for a link
// that would be kept; and an unusable target says which check it failed.

test('classifyRedirectTarget: the host decides before the length; a long Blackboard address is a Blackboard host', () => {
  const longQuery = `?Policy=${'p'.repeat(2100)}&Signature=s&Key-Pair-Id=k`;
  assert.equal(classifyRedirectTarget(`https://us-east-1.learn.blackboardcdn.com/f.pdf${longQuery}`), 'blackboard');
  assert.equal(classifyRedirectTarget(`https://login.microsoftonline.com/x${longQuery}`), 'login');
  assert.equal(classifyRedirectTarget(`https://files.example.org/f.pdf${longQuery}`), 'signed');
  assert.equal(classifyRedirectTarget(`https://example.com/${'a'.repeat(2100)}`), 'unusable');
});

test('resolveSignedUrl: a long redirect to a Blackboard content host is refused with that host named', async () => {
  const target = `https://us-east-1.learn.blackboardcdn.com/f.pdf?Policy=${'p'.repeat(2100)}&Signature=s`;
  const got = await resolveSignedUrl(fakeGet({ [DURABLE]: redirect(target) }), DURABLE);
  assert.equal(got.outcome, 'refused');
  assert.ok(got.reason.includes('us-east-1.learn.blackboardcdn.com'), got.reason);
  assert.ok(!got.reason.includes('Policy'), got.reason);
});

test('resolveSignedUrl: an unusable redirect target says which check it failed, naming the host only where that is safe', async () => {
  const cases = [
    [`https://example.com/${'a'.repeat(2100)}`, /longer than 2048 characters/, 'example.com'],
    ['ftp://example.com/x', /not http\(s\)/, null],
    ['https://intranet/x', /single-label host/, null],
    ['https://10.0.0.5/x', /an IP address/, null],
    ['https://user:secret@example.com/x', /credentials/, null],
  ];
  for (const [target, why, host] of cases) {
    const got = await resolveSignedUrl(fakeGet({ [DURABLE]: redirect(target) }), DURABLE);
    assert.equal(got.outcome, 'refused', target.slice(0, 40));
    assert.match(got.reason, why, target.slice(0, 40));
    if (host) assert.ok(got.reason.includes(host), got.reason);
    assert.ok(!got.reason.includes('secret') && !got.reason.includes('10.0.0.5'), got.reason);
  }
});
