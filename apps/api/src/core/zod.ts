import { applyDecorators, Body, Param, Query, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiParam, ApiQuery, type SchemaObject } from '@nestjs/swagger';
import type { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { badRequest } from './errors.js';

/** Validates (and transforms: coercion, defaults, trimming) input with a zod schema from @acceptance/shared. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw badRequest(
        'VALIDATION_FAILED',
        'Request validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
      );
    }
    return result.data;
  }
}

export function toOpenApi(schema: ZodTypeAny): SchemaObject {
  const json = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' });
  return json as SchemaObject;
}

/** `@ZBody(Schema) body: Schema` — validated body + OpenAPI request body. */
export const ZBody = <S extends ZodTypeAny>(schema: S): ParameterDecorator => Body(new ZodValidationPipe(schema));
export const ZQuery = <S extends ZodTypeAny>(schema: S): ParameterDecorator => Query(new ZodValidationPipe(schema));

export function ApiZodBody(schema: ZodTypeAny): MethodDecorator {
  return ApiBody({ schema: toOpenApi(schema) });
}

/** Documents every property of an object schema as a query parameter. */
export function ApiZodQuery(schema: ZodTypeAny): MethodDecorator {
  const json = toOpenApi(schema);
  const props = (json.properties ?? {}) as Record<string, SchemaObject>;
  const required = new Set(json.required ?? []);
  return applyDecorators(
    ...Object.entries(props).map(([name, s]) => ApiQuery({ name, required: required.has(name), schema: s })),
  );
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Validates a route id parameter (cuid or similar). */
export class IdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !ID.test(value)) throw badRequest('VALIDATION_FAILED', 'Invalid id');
    return value;
  }
}

export const IdParam = (name = 'id'): ParameterDecorator => Param(name, new IdPipe());
export const ApiIdParam = (name = 'id'): MethodDecorator => ApiParam({ name, type: String });
