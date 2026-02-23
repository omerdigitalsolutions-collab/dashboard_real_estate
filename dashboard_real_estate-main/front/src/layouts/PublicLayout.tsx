import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
    return (
        <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
            {/* 
        A clean layout specifically for externally shared links like the property catalog.
        No header, no sidebar, just a simple frame if needed.
      */}
            <main className="w-full h-full min-h-screen">
                <Outlet />
            </main>
        </div>
    );
}
