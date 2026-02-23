import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AIChatPanel from '../dashboard/AIChatPanel';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 lg:mr-64">
        <Header onMenuClick={() => setSidebarOpen(true)} onAskAI={() => setAiChatOpen(true)} />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* AI Chat Panel */}
      <AIChatPanel isOpen={aiChatOpen} onClose={() => setAiChatOpen(false)} />
    </div>
  );
}
