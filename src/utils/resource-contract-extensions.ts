import { resourceSchemas as baseSchemas } from './resource-contract.ts'
import type { ResourceSchema } from './resource-schema.ts'

// 文件托管与反馈统计是当前协议扩展，历史固定契约仍用于兼容回归。
export const resourceSchemas: Record<string, ResourceSchema> = {
  ...baseSchemas,
  ResourceFile: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      content_type: { type: 'string', minLength: 1, maxLength: 255 },
      size: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
    },
    required: ['id', 'name', 'content_type', 'size'],
    additionalProperties: false,
  },
  FeedbackSummary: {
    type: 'object',
    properties: Object.fromEntries(
      ['content_version', 'valid', 'link_invalid', 'outdated', 'incomplete', 'total'].map((key) => [
        key,
        { type: 'integer', minimum: key === 'content_version' ? 1 : 0, maximum: 9007199254740991 },
      ]),
    ),
    required: ['content_version', 'valid', 'link_invalid', 'outdated', 'incomplete', 'total'],
    additionalProperties: false,
    'x-invariant': 'feedback_summary',
  },
}
for (const name of ['DownloadInfo', 'ResourceDetail', 'ResourceSummary']) {
  resourceSchemas[name] = {
    ...baseSchemas[name],
    properties: {
      ...baseSchemas[name]?.properties,
      file: { oneOf: [{ $ref: '#/components/schemas/ResourceFile' }, { type: 'null' }] },
      ...(name === 'DownloadInfo'
        ? {}
        : { feedback_summary: { $ref: '#/components/schemas/FeedbackSummary' } }),
    },
  }
}
