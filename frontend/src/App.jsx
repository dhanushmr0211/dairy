import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './context/ToastContext';
import Dashboard from './pages/Dashboard';
import Farmers from './pages/Farmers';
import MilkEntries from './pages/MilkEntries';
import FeedRecords from './pages/FeedRecords';
import Payments from './pages/Payments';

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/farmers" element={<Farmers />} />
            <Route path="/milk" element={<MilkEntries />} />
            <Route path="/feed" element={<FeedRecords />} />
            <Route path="/payments" element={<Payments />} />
          </Routes>
        </Layout>
      </Router>
    </ToastProvider>
  );
}
