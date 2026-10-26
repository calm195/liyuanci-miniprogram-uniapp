export interface DeletionInput {
  confirmation: 'delete_account'
  expected_version: number
}
export interface DeletionAccepted {
  deletion_receipt: string
  status: 'processing'
}
export interface DeletionStatus {
  status: 'processing' | 'completed'
  retryable_error?: string
}
