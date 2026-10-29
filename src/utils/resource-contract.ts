// 资料模块固定协议目录，供请求和响应边界校验共用。
import type { ResourceSchema } from './resource-schema.ts'
export const resourceSchemas: Record<string, ResourceSchema> = {
  DownloadInfo: {
    type: 'object',
    properties: {
      resource_id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
      download_url: {
        type: 'string',
        'x-contract-text': {
          kind: 'download_url',
          canonical: true,
        },
      },
      extraction_code: {
        type: ['string', 'null'],
        'x-contract-text': {
          kind: 'extraction_code',
          canonical: true,
        },
        maxLength: 64,
      },
      copy_text: {
        type: 'string',
        maxLength: 2120,
      },
    },
    required: ['resource_id', 'version', 'download_url', 'extraction_code', 'copy_text'],
    additionalProperties: false,
    'x-invariant': 'download',
  },
  DownloadInfoEnvelope: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 0,
      },
      message: {
        type: 'string',
      },
      data: {
        $ref: '#/components/schemas/DownloadInfo',
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'data', 'request_id'],
    additionalProperties: false,
  },
  Error400: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 400,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['VALIDATION_FAILED'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error401: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 401,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['UNAUTHENTICATED'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error403: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 403,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['FORBIDDEN', 'VERIFICATION_REQUIRED'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error404: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 404,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['NOT_FOUND'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error409: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 409,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: [
          'VERSION_CONFLICT',
          'STATE_CONFLICT',
          'IDEMPOTENCY_CONFLICT',
          'CATEGORY_IN_USE',
          'CATEGORY_NAME_CONFLICT',
        ],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error413: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 413,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['PAYLOAD_TOO_LARGE'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error415: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 415,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['UNSUPPORTED_MEDIA_TYPE'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error429: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 429,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['RATE_LIMITED'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error500: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 500,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['INTERNAL_ERROR'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Error503: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 503,
      },
      message: {
        type: 'string',
        minLength: 1,
      },
      error_code: {
        type: 'string',
        enum: ['DEPENDENCY_UNAVAILABLE'],
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'error_code', 'request_id'],
    additionalProperties: false,
  },
  Feedback: {
    type: 'object',
    properties: {
      resource_id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      content_version: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
      kind: {
        type: 'string',
        enum: ['valid', 'link_invalid', 'outdated', 'incomplete'],
      },
      version: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
      updated_at: {
        type: 'string',
        format: 'date-time',
        pattern: 'Z$',
      },
    },
    required: ['resource_id', 'content_version', 'kind', 'version', 'updated_at'],
    additionalProperties: false,
  },
  FeedbackEnvelope: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 0,
      },
      message: {
        type: 'string',
      },
      data: {
        $ref: '#/components/schemas/Feedback',
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'data', 'request_id'],
    additionalProperties: false,
  },
  PublicCategory: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      name: {
        type: 'string',
        'x-contract-text': {
          kind: 'name',
          canonical: true,
        },
        maxLength: 30,
      },
    },
    required: ['id', 'name'],
    additionalProperties: false,
  },
  PublicCategoryPage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/PublicCategory',
        },
        maxItems: 100,
      },
      next_cursor: {
        type: ['string', 'null'],
        minLength: 1,
        maxLength: 2048,
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  PublicCategoryPageEnvelope: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 0,
      },
      message: {
        type: 'string',
      },
      data: {
        $ref: '#/components/schemas/PublicCategoryPage',
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'data', 'request_id'],
    additionalProperties: false,
  },
  PutFeedback: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['valid', 'link_invalid', 'outdated', 'incomplete'],
      },
      expected_content_version: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
      expected_feedback_version: {
        type: 'integer',
        minimum: 0,
        maximum: 9007199254740991,
      },
    },
    required: ['kind', 'expected_content_version', 'expected_feedback_version'],
    additionalProperties: false,
  },
  ResourceDetail: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      title: {
        type: 'string',
        'x-contract-text': {
          kind: 'title',
          canonical: true,
        },
        maxLength: 100,
      },
      category: {
        $ref: '#/components/schemas/PublicCategory',
      },
      version: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        pattern: 'Z$',
      },
      updated_at: {
        type: 'string',
        format: 'date-time',
        pattern: 'Z$',
      },
      published_at: {
        type: 'string',
        format: 'date-time',
        pattern: 'Z$',
      },
      description: {
        type: 'string',
        'x-contract-text': {
          kind: 'description',
          canonical: true,
        },
        maxLength: 2000,
      },
      download_url: {
        type: 'string',
        'x-contract-text': {
          kind: 'download_url',
          canonical: true,
        },
      },
      extraction_code: {
        type: ['string', 'null'],
        'x-contract-text': {
          kind: 'extraction_code',
          canonical: true,
        },
        maxLength: 64,
      },
      content_version: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
      my_feedback: {
        oneOf: [
          {
            $ref: '#/components/schemas/Feedback',
          },
          {
            type: 'null',
          },
        ],
      },
      allowed_actions: {
        oneOf: [
          {
            const: ['copy_download'],
          },
          {
            const: ['copy_download', 'submit_feedback'],
          },
        ],
      },
    },
    required: [
      'id',
      'title',
      'category',
      'version',
      'created_at',
      'updated_at',
      'published_at',
      'description',
      'download_url',
      'extraction_code',
      'content_version',
      'my_feedback',
      'allowed_actions',
    ],
    additionalProperties: false,
    'x-invariant': 'student_detail',
  },
  ResourceDetailEnvelope: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 0,
      },
      message: {
        type: 'string',
      },
      data: {
        $ref: '#/components/schemas/ResourceDetail',
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'data', 'request_id'],
    additionalProperties: false,
  },
  ResourcePage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/ResourceSummary',
        },
        maxItems: 50,
      },
      next_cursor: {
        type: ['string', 'null'],
        minLength: 1,
        maxLength: 2048,
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  ResourcePageEnvelope: {
    type: 'object',
    properties: {
      code: {
        type: 'integer',
        const: 0,
      },
      message: {
        type: 'string',
      },
      data: {
        $ref: '#/components/schemas/ResourcePage',
      },
      request_id: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['code', 'message', 'data', 'request_id'],
    additionalProperties: false,
  },
  ResourceSummary: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      title: {
        type: 'string',
        'x-contract-text': {
          kind: 'title',
          canonical: true,
        },
        maxLength: 100,
      },
      category: {
        $ref: '#/components/schemas/PublicCategory',
      },
      version: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        pattern: 'Z$',
      },
      updated_at: {
        type: 'string',
        format: 'date-time',
        pattern: 'Z$',
      },
      published_at: {
        type: 'string',
        format: 'date-time',
        pattern: 'Z$',
      },
      description_excerpt: {
        type: 'string',
        maxLength: 120,
      },
    },
    required: [
      'id',
      'title',
      'category',
      'version',
      'created_at',
      'updated_at',
      'published_at',
      'description_excerpt',
    ],
    additionalProperties: false,
  },
}
export const resourceOperations = {
  resourceCategoriesList: {
    path: '/resource-categories',
    method: 'GET',
    output: 'PublicCategoryPageEnvelope',
    errors: {
      '400': ['VALIDATION_FAILED'],
      '401': ['UNAUTHENTICATED'],
      '403': ['FORBIDDEN', 'VERIFICATION_REQUIRED'],
      '429': ['RATE_LIMITED'],
      '500': ['INTERNAL_ERROR'],
      '503': ['DEPENDENCY_UNAVAILABLE'],
    },
  },
  resourcesList: {
    path: '/resources',
    method: 'GET',
    output: 'ResourcePageEnvelope',
    errors: {
      '400': ['VALIDATION_FAILED'],
      '401': ['UNAUTHENTICATED'],
      '403': ['FORBIDDEN', 'VERIFICATION_REQUIRED'],
      '429': ['RATE_LIMITED'],
      '500': ['INTERNAL_ERROR'],
      '503': ['DEPENDENCY_UNAVAILABLE'],
    },
  },
  resourceDetail: {
    path: '/resources/{id}',
    method: 'GET',
    output: 'ResourceDetailEnvelope',
    errors: {
      '400': ['VALIDATION_FAILED'],
      '401': ['UNAUTHENTICATED'],
      '403': ['FORBIDDEN', 'VERIFICATION_REQUIRED'],
      '429': ['RATE_LIMITED'],
      '500': ['INTERNAL_ERROR'],
      '503': ['DEPENDENCY_UNAVAILABLE'],
      '404': ['NOT_FOUND'],
    },
  },
  resourceDownloadInfo: {
    path: '/resources/{id}/download-info',
    method: 'GET',
    output: 'DownloadInfoEnvelope',
    errors: {
      '400': ['VALIDATION_FAILED'],
      '401': ['UNAUTHENTICATED'],
      '403': ['FORBIDDEN', 'VERIFICATION_REQUIRED'],
      '429': ['RATE_LIMITED'],
      '500': ['INTERNAL_ERROR'],
      '503': ['DEPENDENCY_UNAVAILABLE'],
      '404': ['NOT_FOUND'],
      '409': ['VERSION_CONFLICT'],
    },
  },
  resourceFeedbackPut: {
    path: '/resources/{id}/feedback',
    method: 'PUT',
    output: 'FeedbackEnvelope',
    errors: {
      '400': ['VALIDATION_FAILED'],
      '401': ['UNAUTHENTICATED'],
      '403': ['FORBIDDEN', 'VERIFICATION_REQUIRED'],
      '429': ['RATE_LIMITED'],
      '500': ['INTERNAL_ERROR'],
      '503': ['DEPENDENCY_UNAVAILABLE'],
      '404': ['NOT_FOUND'],
      '409': ['IDEMPOTENCY_CONFLICT', 'VERSION_CONFLICT'],
      '413': ['PAYLOAD_TOO_LARGE'],
      '415': ['UNSUPPORTED_MEDIA_TYPE'],
    },
  },
} as const
