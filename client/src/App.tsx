import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Join from './pages/Join';
import Student from './pages/Student';
import Instructor from './pages/Instructor';
import Projector from './pages/Projector';
import Build from './pages/Build';
import DeckEditor from './pages/DeckEditor';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join" element={<Join />} />
      <Route path="/play" element={<Student />} />
      <Route path="/teach" element={<Instructor />} />
      <Route path="/screen/:token" element={<Projector />} />
      <Route path="/build" element={<Build />} />
      <Route path="/build/:deckId" element={<DeckEditor />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
