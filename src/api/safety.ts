import { request } from '@/utils/request'
import type {
  ReportInput,
  ReportType,
  SafetyAccepted,
  SafetyPage,
  AppealInput,
  Appeal,
  Warning,
} from '@/types/safety'
const query = (cursor?: string) =>
  `?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
export const listReportTypes = (cursor?: string) =>
  request<SafetyPage<ReportType>>({ url: `/report-types${query(cursor)}` })
export const listWarnings = (cursor?: string) =>
  request<SafetyPage<Warning>>({ url: `/me/warnings${query(cursor)}` })
export const listAppeals = (cursor?: string) =>
  request<SafetyPage<Appeal>>({ url: `/me/appeals${query(cursor)}` })
export const submitReport = (input: ReportInput, key: string) =>
  request<SafetyAccepted>({
    url: '/reports',
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
export const submitAppeal = (input: AppealInput, key: string) =>
  request<SafetyAccepted>({
    url: '/me/appeals',
    method: 'POST',
    data: input,
    header: { 'Idempotency-Key': key },
  })
export const writeWarning = (warning: Warning, action: 'display' | 'ack', key: string) =>
  request<Warning>({
    url: `/me/warnings/${encodeURIComponent(warning.id)}/${action}`,
    method: 'POST',
    data: { expected_version: warning.version },
    header: { 'Idempotency-Key': key },
  })
