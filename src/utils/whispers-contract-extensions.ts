import {
  whisperSchemas as baseSchemas,
  whisperOperations as baseOperations,
} from './whispers-contract.ts'
import type { Schema, OperationSpec } from './whispers-schema.ts'

// 增量互动协议覆盖新增字段；历史固定契约保留，旧字段仍严格校验。
export const whisperSchemas: Record<string, Schema> = { ...baseSchemas }
const reference: Schema = { type: 'string', format: 'uuid' }
const nullableReference: Schema = { oneOf: [reference, { type: 'null' }] }
for (const name of ['CommentCreate', 'CommentUpdate'])
  whisperSchemas[name] = {
    ...baseSchemas[name],
    properties: {
      ...baseSchemas[name]?.properties,
      root_comment_id: reference,
      reply_to_comment_id: reference,
    },
  }
for (const name of ['PublicComment', 'OwnerComment'])
  whisperSchemas[name] = {
    ...baseSchemas[name],
    properties: {
      ...baseSchemas[name]?.properties,
      root_comment_id: nullableReference,
      reply_to_comment_id: nullableReference,
      reply_to_label: { type: 'string' },
      reply_count: { type: 'integer', minimum: 0 },
      withdrawn: { type: 'boolean' },
    },
  }
whisperSchemas.PublicPost = {
  ...baseSchemas.PublicPost,
  properties: {
    ...baseSchemas.PublicPost?.properties,
    view_count: { type: 'integer', minimum: 0 },
    favorited: { type: 'boolean' },
  },
}
whisperSchemas.Tags = {
  ...baseSchemas.Tags,
  required: [],
  anyOf: [{ required: ['campus'] }, { required: ['gender'] }, { required: ['grade'] }],
}
export const whisperOperations: Record<string, OperationSpec> = { ...baseOperations }
const comments = baseOperations.whisperCommentsList
const query = comments.input.properties?.query
whisperOperations.whisperCommentsList = {
  ...comments,
  input: {
    ...comments.input,
    properties: {
      ...comments.input.properties,
      query: { ...query, properties: { ...query?.properties, root_comment_id: reference } },
    },
  },
}

whisperSchemas.SourceRef = {
  oneOf: [
    ...(baseSchemas.SourceRef?.oneOf ?? []),
    {
      type: 'object',
      properties: {
        kind: { enum: ['wish', 'story'] },
        id: reference,
        content_version: { type: 'integer', minimum: 1 },
      },
      required: ['kind', 'id', 'content_version'],
      additionalProperties: false,
    },
  ],
}
