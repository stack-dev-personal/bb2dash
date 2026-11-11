/**
 * What the persisted query cache may keep (2026-11-11).
 *
 * `QueryProvider` saves the cache to localStorage as JSON and restores it on the next
 * load. JSON changes some values on the way back: a Map or Set becomes `{}`, a Date a
 * string, NaN `null`, a class instance a plain object. A component that reads the
 * restored value then gets the wrong type. The Inbox's session labels (a Map) came back
 * as `{}` and crashed the Inbox (PR #141).
 *
 * So a query is saved only when its data survives JSON unchanged. Anything else is left
 * out and fetched fresh on the next load: slower by one request, never wrong. A query
 * that wants a Map caches plain pairs and builds the Map in `select`.
 */

import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** True when `JSON.parse(JSON.stringify(value))` gives back an equal value of the same types. */
export function isJsonSafe(value: unknown, seen: Set<object> = new Set()): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      break;
    default:
      // undefined at the top or in an array, bigint, function, symbol
      return false;
  }
  const object = value as object;
  if (seen.has(object)) return false;
  seen.add(object);
  try {
    if (Array.isArray(object)) return object.every((entry) => isJsonSafe(entry, seen));
    if (!isPlainObject(object)) return false;
    // An undefined key is dropped by JSON and reads back as undefined: no change.
    return Object.values(object).every((entry) => entry === undefined || isJsonSafe(entry, seen));
  } finally {
    seen.delete(object);
  }
}

const warned = new Set<string>();

/** `dehydrateOptions.shouldDehydrateQuery` for the localStorage persister. */
export function shouldPersistQuery(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) return false;
  if (isJsonSafe(query.state.data)) return true;
  if (!warned.has(query.queryHash)) {
    warned.add(query.queryHash);
    console.warn(
      `query ${query.queryHash} holds data JSON cannot keep (a Map, Set, Date or class); it is not saved. ` +
        'Cache plain data and build the rest in select.',
    );
  }
  return false;
}
