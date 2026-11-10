export type ActivityPhase =
  'draft' | 'cancelled' | 'upcoming' | 'registration' | 'matching' | 'active' | 'ended'

export interface MatchmakingActivitySummary {
  enrollment_count: number
  successful_pair_count: number
}

export interface MatchmakingActivity {
  id: string
  version: number
  title: string
  description: string
  campuses?: string[]
  registration_opens_at: string
  registration_closes_at: string
  results_at: string
  starts_at: string
  ends_at: string
  days: number
  status: 'draft' | 'published' | 'cancelled'
  phase: ActivityPhase
  summary?: MatchmakingActivitySummary
}

export interface MatchmakingProfile {
  name: string
  gender: 'male' | 'female'
  grade: string
  campus: string
  mbti: string
  age: number
  age_min: number
  age_max: number
  height: number
  height_min: number
  height_max: number
  weight: number
  weight_min: number
  weight_max: number
  wechat: string
  introduction: string
  consent: boolean
}

export type MatchmakingProfileDraft = Omit<MatchmakingProfile, 'gender'> & {
  gender: MatchmakingProfile['gender'] | ''
}

export type MatchmakingPreferences = Omit<
  MatchmakingProfileDraft,
  'name' | 'gender' | 'campus' | 'grade' | 'mbti' | 'consent'
>

export interface MatchmakingAccountProfile {
  account_version: number
  profile?: MatchmakingProfileDraft
  version: number
}

export interface MatchmakingEnrollment {
  id: string
  version: number
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  reason: string
  profile?: MatchmakingProfile
  eligible: boolean
}

export interface MatchmakingScore {
  mbti: number
  age: number
  campus: number
  height: number
  weight: number
}

export interface MatchmakingPair {
  id: string
  version: number
  status: 'draft' | 'published' | 'ended'
  score: number
  score_details: MatchmakingScore
  algorithm: string
  peer?: MatchmakingProfile
  accessible: boolean
  reason?: string
  conversation_id?: string
}

export interface MatchmakingTask {
  id: string
  day_index: number
  unlocks_at: string
  can_open: boolean
  opened_at?: string
  kind?: 'online' | 'offline'
  body?: string
}

export interface MatchmakingDetail {
  activity: MatchmakingActivity
  enrollment?: MatchmakingEnrollment
  pair?: MatchmakingPair
  tasks: MatchmakingTask[]
}

export interface MatchmakingPage {
  items: MatchmakingActivity[]
  total: number
}

export type MatchmakingCommand =
  | {
      kind: 'profile'
      activityId: 'account-profile'
      key: string
      input: { expected_version: number; profile: MatchmakingPreferences }
    }
  | {
      kind: 'enroll'
      activityId: string
      key: string
      input: {
        expected_version: number
        profile_version: number
        account_version: number
        consent: true
      }
    }
  | {
      kind: 'withdraw'
      activityId: string
      key: string
      input: { expected_version: number; reason: string }
    }
  | { kind: 'open'; activityId: string; key: string; taskId: string; input: Record<string, never> }
