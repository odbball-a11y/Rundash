import { HashRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { Icon } from "./components/UI.jsx";
import Progress from "./pages/Progress.jsx";
import * as D from "./pages/Details.jsx";
import Activities from "./pages/Activities.jsx";
import ActivityDetail from "./pages/ActivityDetail.jsx";
import Explore from "./pages/Explore.jsx";
import Profile, { SettingsPage, RecordsPage, PlansPage, DataPage, EditingPage } from "./pages/Profile.jsx";
import { HubDashboard, EvoLab, HubActivities } from "./pages/Hub.jsx";
import Calendar from "./pages/Calendar.jsx";
import { Library, Builder } from "./pages/Workouts.jsx";

const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches;

function Shell({ children }) {
  return (
    <div className="app">
      <header className="topnav">
        <div className="brand"><img src="/icon.svg" width="24" height="24" alt="" />Kemp Fit</div>
        <nav aria-label="Training Hub">
          <NavLink to="/hub/dashboard">Dashboard</NavLink>
          <NavLink to="/hub/evolab">EvoLab Metrics</NavLink>
          <NavLink to="/hub/activities">Activity List</NavLink>
          <NavLink to="/hub/calendar">Calendar</NavLink>
        </nav>
        <div className="right">
          <NavLink to="/progress" className="iconbtn">Today</NavLink>
          <NavLink to="/profile" className="iconbtn" aria-label="Profile"><Icon name="profile" size={16} /></NavLink>
        </div>
      </header>
      <main className="main">{children}</main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/progress"><Icon name="progress" />Progress</NavLink>
        <NavLink to="/activities"><Icon name="activities" />Activities</NavLink>
        <NavLink to="/explore"><Icon name="explore" />Explore</NavLink>
        <NavLink to="/profile"><Icon name="profile" />Profile</NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to={isWide() ? "/hub/dashboard" : "/progress"} replace />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/progress/training-status" element={<D.TrainingStatusDetail />} />
          <Route path="/progress/training-load" element={<D.TrainingLoadDetail />} />
          <Route path="/progress/recovery" element={<D.RecoveryDetail />} />
          <Route path="/progress/recovery-time" element={<Navigate to="/progress/recovery" replace />} />
          <Route path="/progress/running-fitness" element={<D.RunningFitnessDetail />} />
          <Route path="/progress/race-predictor" element={<D.RacePredictorDetail />} />
          <Route path="/progress/resting-hr" element={<D.RestingHrDetail />} />
          <Route path="/progress/sleep" element={<D.SleepDetail />} />
          <Route path="/progress/vo2max" element={<D.Vo2Detail />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/activities/:id" element={<ActivityDetail />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/settings" element={<SettingsPage />} />
          <Route path="/profile/records" element={<RecordsPage />} />
          <Route path="/profile/workouts" element={<Library />} />
          <Route path="/profile/workouts/:id" element={<Builder />} />
          <Route path="/profile/editing" element={<EditingPage />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/profile/plans" element={<PlansPage />} />
          <Route path="/profile/data" element={<DataPage />} />
          <Route path="/hub/dashboard" element={<HubDashboard />} />
          <Route path="/hub/evolab" element={<EvoLab />} />
          <Route path="/hub/activities" element={<HubActivities />} />
          <Route path="/hub/calendar" element={<Calendar />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </HashRouter>
  );
}
