/**
 * A small JSON Schema validator covering the subset of draft 2020-12 used by
 * the schemas in `calibration/schema/`, so tests need no dependencies.
 *
 * Supported keywords: type (string or array), const, enum, required,
 * properties, additionalProperties (boolean or schema), items, minItems,
 * minimum, pattern, and local $ref ("#/$defs/name"). Annotation keywords
 * ($schema, $id, title, description) are ignored. Any other keyword is an
 * error, so a schema can't silently rely on something unchecked.
 */

const KNOWN = new Set([
  '$schema',
  '$id',
  '$defs',
  '$ref',
  'title',
  'description',
  'type',
  'const',
  'enum',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'minItems',
  'minimum',
  'pattern',
]);

export type Schema = { [key: string]: any };

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

const typeMatches = (actual: string, expected: string) => actual === expected || (expected === 'number' && actual === 'integer');

/**
 * Validate `value` against `schema`.
 *
 * @returns Error messages with JSON-pointer-ish paths; empty when valid.
 */
export function validate(schema: Schema, value: unknown): string[] {
  const errors: string[] = [];

  const check = (s: Schema, v: unknown, path: string) => {
    for (const key of Object.keys(s)) {
      if (!KNOWN.has(key)) throw new Error(`Unsupported schema keyword "${key}" at ${path || '/'}`);
    }
    if (s.$ref !== undefined) {
      const match = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(s.$ref);
      if (!match || !schema.$defs?.[match[1]]) throw new Error(`Unresolvable $ref ${s.$ref}`);
      check(schema.$defs[match[1]], v, path);
    }
    const at = path || '/';
    const actual = typeOf(v);
    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => typeMatches(actual, t))) {
        errors.push(`${at}: expected ${types.join(' or ')}, got ${actual}`);
        return;
      }
    }
    if ('const' in s && v !== s.const) errors.push(`${at}: must be ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.includes(v)) errors.push(`${at}: must be one of ${JSON.stringify(s.enum)}`);
    if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) errors.push(`${at}: must be >= ${s.minimum}`);
    if (typeof v === 'string' && s.pattern !== undefined && !new RegExp(s.pattern, 'u').test(v)) {
      errors.push(`${at}: must match ${s.pattern}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errors.push(`${at}: needs at least ${s.minItems} items`);
      if (s.items) v.forEach((item, i) => check(s.items, item, `${path}/${i}`));
    }
    if (actual === 'object') {
      const obj = (v as Record<string, unknown>);
      for (const key of s.required ?? []) if (!(key in obj)) errors.push(`${at}: missing "${key}"`);
      const props = s.properties ?? {};
      for (const [key, child] of Object.entries(obj)) {
        if (key in props) check(props[key], child, `${path}/${key}`);
        else if (s.additionalProperties === false) errors.push(`${at}: unexpected property "${key}"`);
        else if (typeof s.additionalProperties === 'object') check(s.additionalProperties, child, `${path}/${key}`);
      }
    }
  };

  check(schema, value, '');
  return errors;
}
