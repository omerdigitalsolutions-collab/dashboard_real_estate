import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import toast from 'react-hot-toast';

export default function InviteAgentBlock() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      const callInviteAgent = httpsCallable(functions, 'users-inviteAgent');
      // Sending only email, backend will fallback name to email prefix and role to agent
      await callInviteAgent({ email: email.trim(), role: 'agent' });
      
      toast.success('ההזמנה נשלחה בהצלחה למייל: ' + email.trim());
      setEmail('');
    } catch (error: any) {
      if (error.code === 'already-exists') {
        toast.error('המשתמש הזה כבר רשום במערכת.');
      } else {
        toast.error('שגיאה בשליחת ההזמנה. נסה שוב.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mt-2 mb-6" dir="rtl">
      <h3 className="text-lg font-bold text-slate-800 mb-2">הזמנת סוכן חדש למשרד</h3>
      <p className="text-sm text-slate-500 mb-4">
        הזן את כתובת המייל של הסוכן והוא יקבל קישור הצטרפות ישירות למשרד שלך. ניתן גם להזמין בצורה מתקדמת דרך הכפתור למעלה.
      </p>
      
      <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row items-center gap-3">
        <input
          type="email"
          placeholder="agent@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all text-left placeholder:text-slate-400"
          dir="ltr"
        />
        <button
          type="submit"
          disabled={isLoading || !email.trim()}
          className="w-full sm:w-auto flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-70 shadow-sm"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>שלח הזמנה</span>
        </button>
      </form>
    </div>
  );
}
