/**
 * One JSON schema for the model output (ModelOutput in policy.ts: the shared AnalysisResult plus per-snag
 * confidence/evidence and a required bbox), derived from zod, then
 * adapted to each vendor's structured-output dialect. The zod schema stays the validator of record:
 * every response is re-validated with zod regardless of what the vendor enforced.
 */
import { SNAG_CODES } from '@acceptance/checklist';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ModelOutput } from './policy.js';

export type JsonSchema = { [key: string]: unknown };

const isObj = (v: unknown): v is JsonSchema => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep map over every schema node (objects and arrays), bottom-up. */
function mapSchema(node: unknown, fn: (n: JsonSchema) => JsonSchema): unknown {
  if (Array.isArray(node)) return node.map((n) => mapSchema(n, fn));
  if (!isObj(node)) return node;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node)) out[k] = mapSchema(v, fn);
  return fn(out);
}

/** Keywords that at least one vendor rejects; the zod re-validation still enforces them. */
const UNSUPPORTED_KEYWORDS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'multipleOf', 'pattern', 'format', 'default'];

/**
 * Vendor-neutral schema: zod -> JSON Schema 7, inlined (no $ref), with the snag `code` narrowed to the
 * taxonomy enum so models cannot invent codes. Range constraints are moved into descriptions.
 */
export function baseAnalysisSchema(codes: readonly string[] = SNAG_CODES): JsonSchema {
  const raw = zodToJsonSchema(ModelOutput, { $refStrategy: 'none', target: 'jsonSchema7' }) as JsonSchema;
  delete raw.$schema;
  delete raw.definitions;
  const props = raw.properties as JsonSchema;
  const confidence = props.confidence as JsonSchema;
  confidence.description = 'Confidence in the verdict, between 0 and 1.';
  const snags = props.snags as JsonSchema;
  const snagProps = (snags.items as JsonSchema).properties as JsonSchema;
  snagProps.code = { type: 'string', enum: [...codes], description: 'Snag code from the taxonomy, exactly as written.' };
  (snagProps.confidence as JsonSchema).description = 'Probability (0..1) that a reviewer would raise exactly this remark.';
  (snagProps.evidence as JsonSchema).description = 'What you see and where in the photo (English), specific enough to locate the defect.';
  const bbox = snagProps.bbox as JsonSchema;
  bbox.description = 'Bounding box of the defect, fractions 0..1 of image width/height, x/y = top-left corner.';
  return mapSchema(raw, (n) => {
    const c = { ...n };
    for (const k of UNSUPPORTED_KEYWORDS) delete c[k];
    return c;
  }) as JsonSchema;
}

/** Anthropic `output_config.format`: objects need additionalProperties:false; optional properties are allowed. */
export function toClaudeSchema(base: JsonSchema = baseAnalysisSchema()): JsonSchema {
  return mapSchema(base, (n) => (n.type === 'object' ? { ...n, additionalProperties: false } : n)) as JsonSchema;
}

/**
 * OpenAI strict json_schema: every property must be listed in `required`, so optional properties become
 * nullable (`anyOf [T, null]`). Nulls are stripped again before zod validation (see parse.ts).
 */
export function toOpenAISchema(base: JsonSchema = baseAnalysisSchema()): JsonSchema {
  return mapSchema(base, (n) => {
    if (n.type !== 'object' || !isObj(n.properties)) return n;
    const required = new Set(Array.isArray(n.required) ? (n.required as string[]) : []);
    const properties: JsonSchema = {};
    for (const [key, prop] of Object.entries(n.properties)) {
      properties[key] = required.has(key) ? prop : { anyOf: [prop, { type: 'null' }] };
    }
    return { ...n, properties, required: Object.keys(n.properties), additionalProperties: false };
  }) as JsonSchema;
}

/**
 * Gemini `responseJsonSchema` (the SDK's JSON Schema field; `responseSchema` is the older OpenAPI-subset
 * field). `additionalProperties` is dropped because some Gemini models reject it; zod still rejects
 * unknown shapes on our side.
 */
export function toGeminiSchema(base: JsonSchema = baseAnalysisSchema()): JsonSchema {
  return mapSchema(base, (n) => {
    const c = { ...n };
    delete c.additionalProperties;
    return c;
  }) as JsonSchema;
}
