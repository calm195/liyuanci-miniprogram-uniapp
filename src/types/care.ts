export interface CareResources {
  version: string
  source: string
  verified_at: string
  hotline_24_hours: string
  appointment: string
  notice: string
}
export interface CareCard {
  id: string
  resources: CareResources
}
