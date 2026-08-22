import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Join from './pages/Join';
import Student from './pages/Student';
import Instructor from './pages/Instructor';
import Projector from './pages/Projector';
import Build from './pages/Build';
import DeckEditor from './pages/DeckEditor';
import Report from './pages/Report';
import OrgPage from './pages/OrgPage';
import GuideFloatingMenu from './components/GuideFloatingMenu';
import AuthGate from './components/AuthGate';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<Join />} />
        <Route path="/play" element={<Student />} />
        <Route path="/teach" element={<AuthGate><Instructor /></AuthGate>} />
        <Route path="/screen/:token" element={<Projector />} />
        <Route path="/build" element={<AuthGate><Build /></AuthGate>} />
        <Route path="/build/:deckId" element={<AuthGate><DeckEditor /></AuthGate>} />
        <Route path="/report/:classroomId" element={<Report />} />
        <Route path="/org" element={<AuthGate><OrgPage /></AuthGate>} />
        <Route path="*" element={<Home />} />
      </Routes>
      <GuideFloatingMenu />
    </>
  );
}
