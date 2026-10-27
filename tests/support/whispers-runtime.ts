import { readFileSync } from 'node:fs'
import { loadRuntime } from './page-runtime.ts'
import {
  whisperOperations,
  whisperSchemas,
  whisperWrites,
} from '../../src/utils/whispers-contract.ts'
import { matchesSchema } from '../../src/utils/whispers-schema.ts'

export class WhisperTestError extends Error {
  code: number
  statusCode: number
  error_code: string
  request_id: string
  constructor(message: string, code: number, errorCode = '', requestId = '', statusCode = 0) {
    super(message)
    this.request_id = requestId
    this.code = code
    this.statusCode = statusCode
    this.error_code = errorCode
  }
}
export async function whispersRuntime(
  request: (options: Record<string, unknown>) => Promise<unknown>,
  session: { getEpoch: () => number; getToken: () => string },
) {
  const api = await loadRuntime(
    readFileSync(new URL('../../src/api/whispers.ts', import.meta.url), 'utf8'),
    {
      request,
      RequestError: WhisperTestError,
      session,
      matchesSchema,
      whisperOperations,
      whisperSchemas,
    },
  )
  const helpers = await loadRuntime(
    readFileSync(new URL('../../src/utils/whispers.ts', import.meta.url), 'utf8'),
    {
      callWhisper: api.callWhisper,
      RequestError: WhisperTestError,
      session,
      matchesSchema,
      whisperSchemas,
      whisperWrites,
      whisperOperations,
    },
  )
  return { ...api, ...helpers }
}
