import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './app/auth'
import { LocalDataProvider } from './app/data'
import { Layout } from './components/Layout'
import { AccountPage } from './pages/Account'
import { AnalysisPage } from './pages/Analysis'
import { DataPage } from './pages/DataPage'
import { EditReportPage } from './pages/EditReport'
import { HomePage } from './pages/Home'
import { MatchDetailPage } from './pages/MatchDetail'
import { MatchesPage } from './pages/Matches'
import { PublicTeamPage } from './pages/PublicTeam'
import { RecordPage } from './pages/Record'
import { SignInPage } from './pages/SignIn'
import { TeamDetailPage } from './pages/TeamDetail'
import { PitFormPage, PitListPage } from './pages/PitScouting'
import { TeamSetupPage } from './pages/TeamSetup'
import { TournamentDetailPage } from './pages/TournamentDetail'
import { TournamentsPage } from './pages/Tournaments'

function PrivateApp() {
  const { account, loading } = useAuth()
  if (loading) return null
  if (!account) return <SignInPage />
  if (!account.org) return <TeamSetupPage />
  return (
    <LocalDataProvider key={`${account.userId}-${account.org.id}`} account={{ ...account, org: account.org }}>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/pit" element={<PitListPage />} />
          <Route path="/pit/:tid/:team" element={<PitFormPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/matches/:tid/:match" element={<MatchDetailPage />} />
          <Route path="/reports/:id/edit" element={<EditReportPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/analysis/:team" element={<TeamDetailPage />} />
          <Route path="/tournaments" element={<TournamentsPage />} />
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </LocalDataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/t/:owner/*" element={<PublicTeamPage />} />
          <Route path="*" element={<PrivateApp />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
