export type Alliance = 'red' | 'blue'
export type Phase = 'auto' | 'teleop'
export type MatchType = 'qual' | 'playoff'

export type EventType =
  | 'nectar_score'
  | 'nectar_miss'
  | 'pollen_score'
  | 'pollen_miss'
  | 'tip'
  | 'flower_nectar'
  | 'flower_pollen'

/** One tap during a recording. `t` is ms since "Start recording". */
export interface MatchEvent {
  t: number
  type: EventType
  phase: Phase
}

/**
 * Where a robot starts, in inches on the field as seen from the audience (red
 * on the left, y down), and which way its front faces in degrees clockwise
 * from the top wall. See src/lib/field.ts.
 */
export interface StartPose {
  x: number
  y: number
  heading: number
}

export interface PreMatch {
  /** Missing on recordings made before playoffs were tracked — treat as 'qual'. */
  matchType?: MatchType
  matchNumber: number | null
  teamName: string
  teamNumber: number | null
  alliance: Alliance | null
  /** Typed description; only recordings from before the map have this. */
  startingPosition: string
  /** Picked on the field map; missing on older recordings. */
  start?: StartPose | null
  notes: string
  /** The scouted robot's alliance partner. */
  partnerTeam: number | null
  /** The two teams on the opposing alliance. */
  opponentTeams: [number | null, number | null]
}

export interface Toggles {
  leave: boolean
  autoPark: boolean
  teleopPark: boolean
}

/** Alliance-level results, entered after the match for the scouted robot's alliance. */
/** A ball in a flower: pollen, or nectar of an alliance's color. */
export type FlowerBall = 'pollen' | Alliance

export interface PostMatch {
  /**
   * The balls in each flower's scoring volume, bottom → top, in the order of
   * FLOWERS in src/lib/field.ts. Missing on recordings made before the flower
   * screen; those typed the two counts below by hand.
   */
  flowers?: FlowerBall[][] | null
  /** For the scout's alliance; worked out from `flowers` when they're entered. */
  bottomNectarFlowers: number | null
  ownedFlowerBalls: number | null
  gardenBalls: number | null
  cellBalls: number | null
  redScore: number | null
  blueScore: number | null
  strategyNotes: string
}

/** A single recording: one match, seen from one robot. Stored as a JSON document. */
export interface Report {
  id: string
  schemaVersion: 1
  tournamentId: string | null
  /** Team number of the scouting account that recorded this. */
  scoutingTeam: number | null
  pre: PreMatch
  events: MatchEvent[]
  toggles: Toggles
  post: PostMatch
  /** The recording missed part of the match (ended early or was stopped). */
  incomplete?: boolean
  /** The clock was stopped at least once, so event times drift from the real match. */
  paused?: boolean
  /** Tips were tapped for the whole alliance, not only the scouted robot's. Missing on older recordings. */
  allianceTips?: boolean
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export interface PointValues {
  leave: number
  autoPark: number
  teleopPark: number
  autoTip: number
  teleopTip: number
  cellBall: number
  bottomNectar: number
  ownedFlowerBall: number
  gardenBall: number
}

export interface RpThresholds {
  swarmPoints: number
  pollinator1Tips: number
  pollinator2Tips: number
}

export interface TournamentTeam {
  number: number
  name: string
}

/** One qualification match from the published schedule. */
export interface ScheduledMatch {
  match: number
  red: [number, number]
  blue: [number, number]
}

/** The agreed value for something recordings disagree on, or a decision to leave it as entered. */
export type Resolution = { value: number } | { keep: true }

export interface Tournament {
  id: string
  name: string
  eventCode: string
  startDate: string
  points: PointValues
  thresholds: RpThresholds
  /** Optional on older tournaments. */
  teams?: TournamentTeam[]
  /** Qualification schedule; optional on older tournaments. */
  schedule?: ScheduledMatch[]
  /** Agreed values per match ("qual:12") and field ("redScore", "blue.tips", …); see src/lib/consensus.ts. */
  resolutions?: Record<string, Partial<Record<string, Resolution>>>
  createdAt: number
  updatedAt: number
  deleted: boolean
}
