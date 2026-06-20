import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { LeagueTable } from './views/LeagueTable.tsx'
import { TeamDetail } from './views/TeamDetail.tsx'
import { SquadBuilder } from './views/SquadBuilder.tsx'
import { Backtest } from './views/Backtest.tsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <LeagueTable /> },
      { path: 'team/:league/:season/:team', element: <TeamDetail /> },
      { path: 'builder', element: <SquadBuilder /> },
      { path: 'backtest', element: <Backtest /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
