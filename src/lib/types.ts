export type Alliance = 'red' | 'blue'
export type Phase = 'auto' | 'teleop'

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

export interface PreMatch {
  matchNumber: number | null
  teamName: string
  teamNumber: number | null
  alliance: Alliance | null
  startingPosition: string
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
export interface PostMatch {
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

export interface Tournament {
  id: string
  name: string
  eventCode: string
  startDate: string
  points: PointValues
  thresholds: RpThresholds
  createdAt: number
  updatedAt: number
  deleted: boolean
}
