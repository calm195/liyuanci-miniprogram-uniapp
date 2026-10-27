// 从固定 whispers/1.0.0 契约生成；使用 scripts/sync_whispers_contract.py 同步，勿手工修改。
import type { Schema, OperationSpec } from './whispers-schema.ts'
export const whisperSchemas: Record<string, Schema> = {
  BlockAck: {
    type: 'object',
    properties: {
      accepted: {
        const: true,
      },
    },
    required: ['accepted'],
    additionalProperties: false,
  },
  BlockCreate: {
    type: 'object',
    properties: {
      source: {
        $ref: '#/components/schemas/SourceRef',
      },
    },
    required: ['source'],
    additionalProperties: false,
  },
  BlockEntry: {
    type: 'object',
    properties: {
      block_id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      label: {
        const: '已屏蔽对象',
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['interactionBlockDelete'],
        },
        uniqueItems: true,
      },
    },
    required: ['block_id', 'version', 'label', 'allowed_actions'],
    additionalProperties: false,
  },
  BlockEntryPage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/BlockEntry',
        },
        minItems: 0,
      },
      next_cursor: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  Capsule: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      status: {
        type: 'string',
        enum: [
          'scanning',
          'review_pending',
          'locked',
          'unlocked',
          'rejected',
          'isolated',
          'cancelled',
          'deleted',
        ],
      },
      unlock_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      server_now: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      body: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            pattern: '\\S',
          },
          {
            type: 'null',
          },
        ],
      },
      review_result: {
        anyOf: [
          {
            $ref: '#/components/schemas/ReviewResult',
          },
          {
            type: 'null',
          },
        ],
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['whisperCapsuleCancel', 'whisperCapsuleDelete'],
        },
        uniqueItems: true,
      },
    },
    required: [
      'id',
      'version',
      'status',
      'unlock_at',
      'server_now',
      'created_at',
      'body',
      'review_result',
      'allowed_actions',
    ],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: {
            status: {
              not: {
                const: 'unlocked',
              },
            },
          },
        },
        then: {
          properties: {
            body: {
              type: 'null',
            },
          },
        },
        else: {
          properties: {
            body: {
              type: 'string',
              minLength: 1,
              maxLength: 500,
              pattern: '\\S',
            },
          },
        },
      },
    ],
  },
  CapsuleCreate: {
    type: 'object',
    properties: {
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: '\\S',
      },
      unlock_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      safety_notice_accepted: {
        const: true,
      },
    },
    required: ['body', 'unlock_at', 'safety_notice_accepted'],
    additionalProperties: false,
  },
  CapsulePage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/CapsuleSummary',
        },
        minItems: 0,
      },
      next_cursor: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  CapsuleSummary: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      status: {
        type: 'string',
        enum: [
          'scanning',
          'review_pending',
          'locked',
          'unlocked',
          'rejected',
          'isolated',
          'cancelled',
          'deleted',
        ],
      },
      unlock_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      server_now: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      body: {
        type: 'null',
      },
      review_result: {
        anyOf: [
          {
            $ref: '#/components/schemas/ReviewResult',
          },
          {
            type: 'null',
          },
        ],
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['whisperCapsuleCancel', 'whisperCapsuleDelete'],
        },
        uniqueItems: true,
      },
    },
    required: [
      'id',
      'version',
      'status',
      'unlock_at',
      'server_now',
      'created_at',
      'body',
      'review_result',
      'allowed_actions',
    ],
    additionalProperties: false,
  },
  CommentCreate: {
    type: 'object',
    properties: {
      expected_post_version: {
        type: 'integer',
        minimum: 1,
      },
      expected_comments_epoch: {
        type: 'integer',
        minimum: 1,
      },
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: '\\S',
      },
      identity: {
        $ref: '#/components/schemas/IdentityInput',
      },
    },
    required: ['expected_post_version', 'expected_comments_epoch', 'body', 'identity'],
    additionalProperties: false,
  },
  CommentUpdate: {
    type: 'object',
    properties: {
      expected_version: {
        type: 'integer',
        minimum: 1,
      },
      expected_post_version: {
        type: 'integer',
        minimum: 1,
      },
      expected_comments_epoch: {
        type: 'integer',
        minimum: 1,
      },
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: '\\S',
      },
      identity: {
        $ref: '#/components/schemas/IdentityInput',
      },
    },
    required: [
      'expected_version',
      'expected_post_version',
      'expected_comments_epoch',
      'body',
      'identity',
    ],
    additionalProperties: false,
  },
  CommentsSetting: {
    type: 'object',
    properties: {
      expected_version: {
        type: 'integer',
        minimum: 1,
      },
      comments_open: {
        type: 'boolean',
      },
    },
    required: ['expected_version', 'comments_open'],
    additionalProperties: false,
  },
  HelpDirectory: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['ready', 'unavailable'],
      },
      version: {
        anyOf: [
          {
            type: 'integer',
            minimum: 1,
          },
          {
            type: 'null',
          },
        ],
      },
      verified_at: {
        anyOf: [
          {
            type: 'string',
            format: 'date-time',
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
          },
          {
            type: 'null',
          },
        ],
      },
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/HelpItem',
        },
        minItems: 0,
      },
    },
    required: ['status', 'version', 'verified_at', 'items'],
    additionalProperties: false,
  },
  HelpItem: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['school_appointment', 'hotline'],
      },
      label: {
        type: 'string',
      },
      contact: {
        type: 'string',
      },
      source_url: {
        type: 'string',
        format: 'uri',
      },
    },
    required: ['kind', 'label', 'contact', 'source_url'],
    additionalProperties: false,
  },
  HugCommand: {
    type: 'object',
    properties: {
      expected_post_version: {
        type: 'integer',
        minimum: 1,
      },
      expected_hug_version: {
        type: 'integer',
        minimum: 0,
      },
      active: {
        type: 'boolean',
      },
    },
    required: ['expected_post_version', 'expected_hug_version', 'active'],
    additionalProperties: false,
  },
  HugResult: {
    type: 'object',
    properties: {
      post_id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      hug_count: {
        type: 'integer',
        minimum: 0,
      },
      my_hug: {
        $ref: '#/components/schemas/HugState',
      },
    },
    required: ['post_id', 'hug_count', 'my_hug'],
    additionalProperties: false,
  },
  HugState: {
    type: 'object',
    properties: {
      active: {
        type: 'boolean',
      },
      version: {
        type: 'integer',
        minimum: 0,
      },
    },
    required: ['active', 'version'],
    additionalProperties: false,
  },
  IdentityInput: {
    oneOf: [
      {
        type: 'object',
        properties: {
          mode: {
            const: 'anonymous',
          },
        },
        required: ['mode'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          mode: {
            const: 'semi',
          },
          tags: {
            $ref: '#/components/schemas/Tags',
          },
          dictionary_version: {
            type: 'integer',
            minimum: 1,
          },
        },
        required: ['mode', 'tags', 'dictionary_version'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          mode: {
            const: 'named',
          },
          nickname_version: {
            type: 'integer',
            minimum: 1,
          },
        },
        required: ['mode', 'nickname_version'],
        additionalProperties: false,
      },
    ],
  },
  ModuleConfig: {
    type: 'object',
    properties: {
      contract_version: {
        const: 'whispers/1.0.0',
      },
      enabled: {
        type: 'boolean',
      },
      server_now: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      semi_available: {
        type: 'boolean',
      },
      grade_dictionary: {
        type: 'object',
        properties: {
          version: {
            anyOf: [
              {
                type: 'integer',
                minimum: 1,
              },
              {
                type: 'null',
              },
            ],
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                label: {
                  type: 'string',
                },
              },
              required: ['code', 'label'],
              additionalProperties: false,
            },
            minItems: 0,
          },
        },
        required: ['version', 'items'],
        additionalProperties: false,
      },
      limits: {
        type: 'object',
        properties: {
          text_codepoints: {
            const: 500,
          },
          nickname_min: {
            const: 2,
          },
          nickname_max: {
            const: 20,
          },
          capsule_min_delay_seconds: {
            const: 60,
          },
          capsule_max_delay_seconds: {
            const: 31536000,
          },
          capsule_active_limit: {
            const: 20,
          },
        },
        required: [
          'text_codepoints',
          'nickname_min',
          'nickname_max',
          'capsule_min_delay_seconds',
          'capsule_max_delay_seconds',
          'capsule_active_limit',
        ],
        additionalProperties: false,
      },
      report_types: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
            },
            label: {
              type: 'string',
            },
          },
          required: ['code', 'label'],
          additionalProperties: false,
        },
        minItems: 0,
      },
      block_api: {
        const: 'opaque-v1',
      },
    },
    required: [
      'contract_version',
      'enabled',
      'server_now',
      'semi_available',
      'grade_dictionary',
      'limits',
      'report_types',
      'block_api',
    ],
    additionalProperties: false,
  },
  NicknameCommand: {
    type: 'object',
    properties: {
      expected_version: {
        type: 'integer',
        minimum: 1,
      },
      label: {
        type: 'string',
        minLength: 2,
        maxLength: 20,
        pattern: '\\S',
      },
    },
    required: ['expected_version', 'label'],
    additionalProperties: false,
  },
  NicknameState: {
    type: 'object',
    properties: {
      version: {
        type: 'integer',
        minimum: 1,
      },
      active: {
        anyOf: [
          {
            type: 'object',
            properties: {
              nickname_version: {
                type: 'integer',
                minimum: 1,
              },
              label: {
                type: 'string',
                minLength: 2,
                maxLength: 20,
                pattern: '\\S',
              },
            },
            required: ['nickname_version', 'label'],
            additionalProperties: false,
          },
          {
            type: 'null',
          },
        ],
      },
      candidate: {
        anyOf: [
          {
            type: 'object',
            properties: {
              nickname_version: {
                type: 'integer',
                minimum: 1,
              },
              label: {
                type: 'string',
                minLength: 2,
                maxLength: 20,
                pattern: '\\S',
              },
              status: {
                type: 'string',
                enum: [
                  'scanning',
                  'review_pending',
                  'approved',
                  'rejected',
                  'restricted',
                  'isolated',
                ],
              },
              review_result: {
                anyOf: [
                  {
                    $ref: '#/components/schemas/ReviewResult',
                  },
                  {
                    type: 'null',
                  },
                ],
              },
            },
            required: ['nickname_version', 'label', 'status', 'review_result'],
            additionalProperties: false,
          },
          {
            type: 'null',
          },
        ],
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['whisperNicknameSet'],
        },
        uniqueItems: true,
      },
    },
    required: ['version', 'active', 'candidate', 'allowed_actions'],
    additionalProperties: false,
  },
  Notification: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      kind: {
        type: 'string',
        enum: ['whisper_comment', 'whisper_capsule_unlocked'],
      },
      target_kind: {
        type: 'string',
        enum: ['post', 'capsule'],
      },
      target_id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      comment_id: {
        anyOf: [
          {
            type: 'string',
            format: 'uuid',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          {
            type: 'null',
          },
        ],
      },
      read: {
        type: 'boolean',
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      notice: {
        type: 'string',
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['whisperNotificationRead'],
        },
        uniqueItems: true,
      },
    },
    required: [
      'id',
      'version',
      'kind',
      'target_kind',
      'target_id',
      'comment_id',
      'read',
      'created_at',
      'notice',
      'allowed_actions',
    ],
    additionalProperties: false,
  },
  NotificationPage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/Notification',
        },
        minItems: 0,
      },
      next_cursor: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  OwnerComment: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      content_version: {
        type: 'integer',
        minimum: 1,
      },
      status: {
        type: 'string',
        enum: [
          'scanning',
          'review_pending',
          'published',
          'rejected',
          'withdrawn',
          'cancelled',
          'restricted',
          'isolated',
          'privacy_hold',
          'context_changed',
        ],
      },
      body: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            pattern: '\\S',
          },
          {
            type: 'null',
          },
        ],
      },
      identity_input: {
        anyOf: [
          {
            $ref: '#/components/schemas/IdentityInput',
          },
          {
            type: 'null',
          },
        ],
      },
      review_result: {
        anyOf: [
          {
            $ref: '#/components/schemas/ReviewResult',
          },
          {
            type: 'null',
          },
        ],
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      updated_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      published_at: {
        anyOf: [
          {
            type: 'string',
            format: 'date-time',
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
          },
          {
            type: 'null',
          },
        ],
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['whisperCommentUpdate', 'whisperCommentWithdraw'],
        },
        uniqueItems: true,
      },
      post_id: {
        anyOf: [
          {
            type: 'string',
            format: 'uuid',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          {
            type: 'null',
          },
        ],
      },
      parent_content_version: {
        type: 'integer',
        minimum: 1,
      },
      recovery_body: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            pattern: '\\S',
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: [
      'id',
      'version',
      'content_version',
      'status',
      'body',
      'identity_input',
      'review_result',
      'created_at',
      'updated_at',
      'published_at',
      'allowed_actions',
      'post_id',
      'parent_content_version',
      'recovery_body',
    ],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: {
            status: {
              enum: ['privacy_hold', 'isolated', 'restricted'],
            },
          },
        },
        then: {
          properties: {
            body: {
              type: 'null',
            },
            identity_input: {
              type: 'null',
            },
          },
        },
      },
      {
        if: {
          properties: {
            status: {
              not: {
                const: 'privacy_hold',
              },
            },
          },
        },
        then: {
          properties: {
            recovery_body: {
              type: 'null',
            },
          },
        },
      },
    ],
  },
  OwnerCommentPage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/OwnerComment',
        },
        minItems: 0,
      },
      next_cursor: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  OwnerPost: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      content_version: {
        type: 'integer',
        minimum: 1,
      },
      status: {
        type: 'string',
        enum: [
          'draft',
          'scanning',
          'review_pending',
          'published',
          'rejected',
          'withdrawn',
          'cancelled',
          'restricted',
          'isolated',
          'privacy_hold',
        ],
      },
      body: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            pattern: '\\S',
          },
          {
            type: 'null',
          },
        ],
      },
      identity_input: {
        anyOf: [
          {
            $ref: '#/components/schemas/IdentityInput',
          },
          {
            type: 'null',
          },
        ],
      },
      review_result: {
        anyOf: [
          {
            $ref: '#/components/schemas/ReviewResult',
          },
          {
            type: 'null',
          },
        ],
      },
      created_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      updated_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      published_at: {
        anyOf: [
          {
            type: 'string',
            format: 'date-time',
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
          },
          {
            type: 'null',
          },
        ],
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'whisperCommentsSetting',
            'whisperPostSubmit',
            'whisperPostUpdate',
            'whisperPostWithdraw',
          ],
        },
        uniqueItems: true,
      },
      comments_open: {
        type: 'boolean',
      },
      comments_epoch: {
        type: 'integer',
        minimum: 1,
      },
    },
    required: [
      'id',
      'version',
      'content_version',
      'status',
      'body',
      'identity_input',
      'review_result',
      'created_at',
      'updated_at',
      'published_at',
      'allowed_actions',
      'comments_open',
      'comments_epoch',
    ],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: {
            status: {
              enum: ['privacy_hold', 'isolated', 'restricted'],
            },
          },
        },
        then: {
          properties: {
            body: {
              type: 'null',
            },
            identity_input: {
              type: 'null',
            },
          },
        },
      },
    ],
  },
  OwnerPostPage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/OwnerPost',
        },
        minItems: 0,
      },
      next_cursor: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  PostCreate: {
    type: 'object',
    properties: {
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: '\\S',
      },
      identity: {
        $ref: '#/components/schemas/IdentityInput',
      },
    },
    required: ['body', 'identity'],
    additionalProperties: false,
  },
  PostUpdate: {
    type: 'object',
    properties: {
      expected_version: {
        type: 'integer',
        minimum: 1,
      },
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: '\\S',
      },
      identity: {
        $ref: '#/components/schemas/IdentityInput',
      },
    },
    required: ['expected_version', 'body', 'identity'],
    additionalProperties: false,
  },
  PublicComment: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      content_version: {
        type: 'integer',
        minimum: 1,
      },
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: '\\S',
      },
      identity: {
        $ref: '#/components/schemas/PublicIdentity',
      },
      published_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      school_related: {
        type: 'boolean',
      },
      notice_codes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['UNVERIFIED_SCHOOL'],
        },
        minItems: 0,
      },
      notice_text: {
        anyOf: [
          {
            const: '未经证实',
          },
          {
            type: 'null',
          },
        ],
      },
      viewer_is_author: {
        type: 'boolean',
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['interactionBlockCreate', 'whisperReportCreate'],
        },
        uniqueItems: true,
      },
      post_id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      parent_content_version: {
        type: 'integer',
        minimum: 1,
      },
    },
    required: [
      'id',
      'version',
      'content_version',
      'body',
      'identity',
      'published_at',
      'school_related',
      'notice_codes',
      'notice_text',
      'viewer_is_author',
      'allowed_actions',
      'post_id',
      'parent_content_version',
    ],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: {
            school_related: {
              const: false,
            },
          },
        },
        then: {
          properties: {
            notice_codes: {
              maxItems: 0,
            },
            notice_text: {
              type: 'null',
            },
          },
        },
        else: {
          properties: {
            notice_codes: {
              contains: {
                const: 'UNVERIFIED_SCHOOL',
              },
            },
            notice_text: {
              const: '未经证实',
            },
          },
        },
      },
    ],
  },
  PublicCommentPage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/PublicComment',
        },
        minItems: 0,
      },
      next_cursor: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  PublicIdentity: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['anonymous', 'semi', 'named'],
      },
      label: {
        type: 'string',
      },
      tags: {
        anyOf: [
          {
            $ref: '#/components/schemas/Tags',
          },
          {
            type: 'null',
          },
        ],
      },
      is_author: {
        type: 'boolean',
      },
    },
    required: ['mode', 'label', 'tags', 'is_author'],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: {
            mode: {
              enum: ['anonymous', 'named'],
            },
          },
        },
        then: {
          properties: {
            tags: {
              type: 'null',
            },
          },
        },
        else: {
          properties: {
            tags: {
              $ref: '#/components/schemas/Tags',
            },
          },
        },
      },
    ],
  },
  PublicPost: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      content_version: {
        type: 'integer',
        minimum: 1,
      },
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: '\\S',
      },
      identity: {
        $ref: '#/components/schemas/PublicIdentity',
      },
      published_at: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      school_related: {
        type: 'boolean',
      },
      notice_codes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['UNVERIFIED_SCHOOL'],
        },
        minItems: 0,
      },
      notice_text: {
        anyOf: [
          {
            const: '未经证实',
          },
          {
            type: 'null',
          },
        ],
      },
      viewer_is_author: {
        type: 'boolean',
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'interactionBlockCreate',
            'whisperCommentCreate',
            'whisperHugSet',
            'whisperReportCreate',
          ],
        },
        uniqueItems: true,
      },
      comments_open: {
        type: 'boolean',
      },
      comments_epoch: {
        type: 'integer',
        minimum: 1,
      },
      comment_count: {
        type: 'integer',
        minimum: 0,
      },
      hug_count: {
        type: 'integer',
        minimum: 0,
      },
      my_hug: {
        anyOf: [
          {
            $ref: '#/components/schemas/HugState',
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: [
      'id',
      'version',
      'content_version',
      'body',
      'identity',
      'published_at',
      'school_related',
      'notice_codes',
      'notice_text',
      'viewer_is_author',
      'allowed_actions',
      'comments_open',
      'comments_epoch',
      'comment_count',
      'hug_count',
      'my_hug',
    ],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: {
            school_related: {
              const: false,
            },
          },
        },
        then: {
          properties: {
            notice_codes: {
              maxItems: 0,
            },
            notice_text: {
              type: 'null',
            },
          },
        },
        else: {
          properties: {
            notice_codes: {
              contains: {
                const: 'UNVERIFIED_SCHOOL',
              },
            },
            notice_text: {
              const: '未经证实',
            },
          },
        },
      },
    ],
  },
  PublicPostPage: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/PublicPost',
        },
        minItems: 0,
      },
      next_cursor: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['items', 'next_cursor'],
    additionalProperties: false,
  },
  ReportAck: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      },
      status: {
        const: 'pending',
      },
    },
    required: ['id', 'status'],
    additionalProperties: false,
  },
  ReportCreate: {
    type: 'object',
    properties: {
      source: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['whisper_post', 'whisper_comment'],
          },
          id: {
            type: 'string',
            format: 'uuid',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          content_version: {
            type: 'integer',
            minimum: 1,
          },
        },
        required: ['kind', 'id', 'content_version'],
        additionalProperties: false,
      },
      type_code: {
        type: 'string',
        minLength: 1,
        maxLength: 32,
      },
    },
    required: ['source', 'type_code'],
    additionalProperties: false,
  },
  ReviewResult: {
    type: 'object',
    properties: {
      decision: {
        type: 'string',
        enum: ['pending', 'approved', 'rejected', 'cancelled'],
      },
      content_version: {
        type: 'integer',
        minimum: 1,
      },
      reason: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            pattern: '\\S',
          },
          {
            type: 'null',
          },
        ],
      },
      revision_suggestion: {
        anyOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            pattern: '\\S',
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: ['decision', 'content_version', 'reason', 'revision_suggestion'],
    additionalProperties: false,
    allOf: [
      {
        if: {
          properties: {
            decision: {
              const: 'rejected',
            },
          },
        },
        then: {
          properties: {
            reason: {
              type: 'string',
              minLength: 1,
              maxLength: 500,
              pattern: '\\S',
            },
            revision_suggestion: {
              type: 'string',
              minLength: 1,
              maxLength: 500,
              pattern: '\\S',
            },
          },
        },
        else: {
          properties: {
            reason: {
              type: 'null',
            },
            revision_suggestion: {
              type: 'null',
            },
          },
        },
      },
    ],
  },
  SourceRef: {
    oneOf: [
      {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['whisper_post', 'whisper_comment'],
          },
          id: {
            type: 'string',
            format: 'uuid',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
          content_version: {
            type: 'integer',
            minimum: 1,
          },
        },
        required: ['kind', 'id', 'content_version'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          kind: {
            const: 'public_profile',
          },
          id: {
            type: 'string',
            format: 'uuid',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          },
        },
        required: ['kind', 'id'],
        additionalProperties: false,
      },
    ],
  },
  Tags: {
    type: 'object',
    properties: {
      campus: {
        type: 'string',
        enum: ['wushan', 'university_town', 'international'],
      },
      grade: {
        type: 'string',
        minLength: 1,
        maxLength: 32,
      },
      gender: {
        type: 'string',
        enum: ['male', 'female', 'undisclosed'],
      },
    },
    required: ['campus', 'grade', 'gender'],
    additionalProperties: false,
  },
  VersionCommand: {
    type: 'object',
    properties: {
      expected_version: {
        type: 'integer',
        minimum: 1,
      },
    },
    required: ['expected_version'],
    additionalProperties: false,
  },
  Workspace: {
    type: 'object',
    properties: {
      server_now: {
        type: 'string',
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
      },
      verification: {
        type: 'string',
        enum: ['unverified', 'pending', 'verified', 'rejected'],
      },
      write_restricted: {
        type: 'boolean',
      },
      allowed_actions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['interactionBlockCreate', 'whisperCapsuleCreate', 'whisperPostCreate'],
        },
        uniqueItems: true,
      },
    },
    required: ['server_now', 'verification', 'write_restricted', 'allowed_actions'],
    additionalProperties: false,
  },
}
export const whisperOperations: Record<string, OperationSpec> = {
  whisperConfigGet: {
    path: '/whispers/config',
    method: 'GET',
    private: false,
    input: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/ModuleConfig',
    },
  },
  whisperHelpGet: {
    path: '/whispers/help',
    method: 'GET',
    private: false,
    input: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/HelpDirectory',
    },
  },
  whisperPostsList: {
    path: '/whispers/posts',
    method: 'GET',
    private: false,
    input: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
            },
            cursor: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/PublicPostPage',
    },
  },
  whisperPostGet: {
    path: '/whispers/posts/{post_id}',
    method: 'GET',
    private: false,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/PublicPost',
    },
  },
  whisperCommentsList: {
    path: '/whispers/posts/{post_id}/comments',
    method: 'GET',
    private: false,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
        query: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
            },
            cursor: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/PublicCommentPage',
    },
  },
  whisperCommentCreate: {
    path: '/whispers/posts/{post_id}/comments',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/CommentCreate',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerComment',
    },
  },
  whisperWorkspaceGet: {
    path: '/me/whispers',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/Workspace',
    },
  },
  whisperOwnPostsList: {
    path: '/me/whispers/posts',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
            },
            cursor: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerPostPage',
    },
  },
  whisperPostCreate: {
    path: '/me/whispers/posts',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        data: {
          $ref: '#/components/schemas/PostCreate',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerPost',
    },
  },
  whisperOwnPostGet: {
    path: '/me/whispers/posts/{post_id}',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerPost',
    },
  },
  whisperPostUpdate: {
    path: '/me/whispers/posts/{post_id}',
    method: 'PUT',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/PostUpdate',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerPost',
    },
  },
  whisperPostSubmit: {
    path: '/me/whispers/posts/{post_id}/submit',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/VersionCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerPost',
    },
  },
  whisperPostWithdraw: {
    path: '/me/whispers/posts/{post_id}/withdraw',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/VersionCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerPost',
    },
  },
  whisperCommentsSetting: {
    path: '/me/whispers/posts/{post_id}/comments-setting',
    method: 'PUT',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/CommentsSetting',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerPost',
    },
  },
  whisperOwnCommentsList: {
    path: '/me/whispers/comments',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
            },
            cursor: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerCommentPage',
    },
  },
  whisperOwnCommentGet: {
    path: '/me/whispers/comments/{comment_id}',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            comment_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['comment_id'],
          additionalProperties: false,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerComment',
    },
  },
  whisperCommentUpdate: {
    path: '/me/whispers/comments/{comment_id}',
    method: 'PUT',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            comment_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['comment_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/CommentUpdate',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerComment',
    },
  },
  whisperCommentWithdraw: {
    path: '/me/whispers/comments/{comment_id}/withdraw',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            comment_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['comment_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/VersionCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/OwnerComment',
    },
  },
  whisperHugSet: {
    path: '/whispers/posts/{post_id}/hugs',
    method: 'PUT',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['post_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/HugCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/HugResult',
    },
  },
  whisperNicknameGet: {
    path: '/me/whispers/nickname',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/NicknameState',
    },
  },
  whisperNicknameSet: {
    path: '/me/whispers/nickname',
    method: 'PUT',
    private: true,
    input: {
      type: 'object',
      properties: {
        data: {
          $ref: '#/components/schemas/NicknameCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/NicknameState',
    },
  },
  whisperCapsulesList: {
    path: '/me/whispers/capsules',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
            },
            cursor: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/CapsulePage',
    },
  },
  whisperCapsuleCreate: {
    path: '/me/whispers/capsules',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        data: {
          $ref: '#/components/schemas/CapsuleCreate',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/CapsuleSummary',
    },
  },
  whisperCapsuleGet: {
    path: '/me/whispers/capsules/{capsule_id}',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            capsule_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['capsule_id'],
          additionalProperties: false,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/Capsule',
    },
  },
  whisperCapsuleCancel: {
    path: '/me/whispers/capsules/{capsule_id}/cancel',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            capsule_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['capsule_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/VersionCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/CapsuleSummary',
    },
  },
  whisperCapsuleDelete: {
    path: '/me/whispers/capsules/{capsule_id}/delete',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            capsule_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['capsule_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/VersionCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/CapsuleSummary',
    },
  },
  interactionBlocksList: {
    path: '/me/interaction-blocks',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
            },
            cursor: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/BlockEntryPage',
    },
  },
  interactionBlockCreate: {
    path: '/me/interaction-blocks',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        data: {
          $ref: '#/components/schemas/BlockCreate',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/BlockAck',
    },
  },
  interactionBlockDelete: {
    path: '/me/interaction-blocks/{block_id}',
    method: 'DELETE',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            block_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['block_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/VersionCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: null,
  },
  whisperReportCreate: {
    path: '/whispers/reports',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        data: {
          $ref: '#/components/schemas/ReportCreate',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/ReportAck',
    },
  },
  whisperNotificationsList: {
    path: '/me/whispers/notifications',
    method: 'GET',
    private: true,
    input: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
            },
            cursor: {
              type: 'string',
              minLength: 1,
              maxLength: 4096,
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/NotificationPage',
    },
  },
  whisperNotificationRead: {
    path: '/me/whispers/notifications/{notification_id}/read',
    method: 'POST',
    private: true,
    input: {
      type: 'object',
      properties: {
        path: {
          type: 'object',
          properties: {
            notification_id: {
              type: 'string',
              format: 'uuid',
              pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            },
          },
          required: ['notification_id'],
          additionalProperties: false,
        },
        data: {
          $ref: '#/components/schemas/VersionCommand',
        },
        key: {
          type: 'string',
          format: 'uuid',
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        },
      },
      required: ['path', 'data', 'key'],
      additionalProperties: false,
    },
    output: {
      $ref: '#/components/schemas/Notification',
    },
  },
}
export const whisperWrites = [
  {
    operation_id: 'whisperPostCreate',
    projection: 'Workspace.allowed_actions',
    target: '/me/whispers/posts',
    version_source: '不适用',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperPostUpdate',
    projection: 'OwnerPost.allowed_actions',
    target: '/me/whispers/posts/{post_id}',
    version_source: 'OwnerPost.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperPostSubmit',
    projection: 'OwnerPost.allowed_actions',
    target: '/me/whispers/posts/{post_id}/submit',
    version_source: 'OwnerPost.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperPostWithdraw',
    projection: 'OwnerPost.allowed_actions',
    target: '/me/whispers/posts/{post_id}/withdraw',
    version_source: 'OwnerPost.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperCommentsSetting',
    projection: 'OwnerPost.allowed_actions',
    target: '/me/whispers/posts/{post_id}/comments-setting',
    version_source: 'OwnerPost.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperCommentCreate',
    projection: 'PublicPost.allowed_actions',
    target: '/whispers/posts/{post_id}/comments',
    version_source: 'PublicPost.version + comments_epoch',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperCommentUpdate',
    projection: 'OwnerComment.allowed_actions',
    target: '/me/whispers/comments/{comment_id}',
    version_source: 'OwnerComment.version + 当前PublicPost.version/comments_epoch',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperCommentWithdraw',
    projection: 'OwnerComment.allowed_actions',
    target: '/me/whispers/comments/{comment_id}/withdraw',
    version_source: 'OwnerComment.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperHugSet',
    projection: 'PublicPost.allowed_actions',
    target: '/whispers/posts/{post_id}/hugs',
    version_source: 'PublicPost.version + my_hug.version，首次为0',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperNicknameSet',
    projection: 'NicknameState.allowed_actions',
    target: '/me/whispers/nickname',
    version_source: 'NicknameState.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperCapsuleCreate',
    projection: 'Workspace.allowed_actions',
    target: '/me/whispers/capsules',
    version_source: '不适用',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperCapsuleCancel',
    projection: 'Capsule/CapsuleSummary.allowed_actions',
    target: '/me/whispers/capsules/{capsule_id}/cancel',
    version_source: 'Capsule.version 或 CapsuleSummary.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperCapsuleDelete',
    projection: 'Capsule/CapsuleSummary.allowed_actions',
    target: '/me/whispers/capsules/{capsule_id}/delete',
    version_source: 'Capsule.version 或 CapsuleSummary.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'interactionBlockCreate',
    projection: 'PublicPost/PublicComment/Workspace.allowed_actions',
    target: '/me/interaction-blocks',
    version_source: '不适用',
    auth_scope: 'student',
  },
  {
    operation_id: 'interactionBlockDelete',
    projection: 'BlockEntry.allowed_actions',
    target: '/me/interaction-blocks/{block_id}',
    version_source: 'BlockEntry.version',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperReportCreate',
    projection: 'PublicPost/PublicComment.allowed_actions',
    target: '/whispers/reports',
    version_source: '不适用',
    auth_scope: 'student',
  },
  {
    operation_id: 'whisperNotificationRead',
    projection: 'Notification.allowed_actions',
    target: '/me/whispers/notifications/{notification_id}/read',
    version_source: 'Notification.version',
    auth_scope: 'student',
  },
] as const
