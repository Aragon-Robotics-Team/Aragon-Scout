import { DEFAULT_POINTS, DEFAULT_THRESHOLDS } from './scoring'
import type { Report, Tournament } from './types'

export function uuid(): string {
  return crypto.randomUUID()
}

export function newReport(tournamentId: string | null, scoutingTeam: number | null): Report {
  const now = Date.now()
  return {
    id: uuid(),
    schemaVersion: 1,
    tournamentId,
    scoutingTeam,
    pre: {
      matchNumber: null,
      teamName: '',
      teamNumber: null,
      alliance: null,
      startingPosition: '',
      notes: '',
      partnerTeam: null,
      opponentTeams: [null, null],
    },
    events: [],
    toggles: { leave: false, autoPark: false, teleopPark: false },
    post: {
      bottomNectarFlowers: null,
      ownedFlowerBalls: null,
      gardenBalls: null,
      cellBalls: null,
      redScore: null,
      blueScore: null,
      strategyNotes: '',
    },
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
}

export function newTournament(name: string, eventCode = '', startDate = ''): Tournament {
  const now = Date.now()
  return {
    id: uuid(),
    name,
    eventCode,
    startDate,
    points: { ...DEFAULT_POINTS },
    thresholds: { ...DEFAULT_THRESHOLDS },
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
}
