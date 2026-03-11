import React, { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useAuth } from '../../context/AuthContext';
import { markTourAsSeen } from '../../services/userService';

const tourSteps: Step[] = [
  {
    target: '.tour-dashboard',
    content: (
      <div className="text-right" dir="rtl">
        <h3 className="text-lg font-bold text-slate-800 mb-2">ברוכים הבאים ל-hOMER 👋</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          מערכת ההפעלה החכמה שלכם לנדל״ן. כאן תוכלו להתאים אישית את לוח הבקרה ולגרור את הווידג'טים בדיוק למקום שתרצו.
        </p>
      </div>
    ),
    disableBeacon: true,
  },
  {
    target: '.tour-ai-copilot',
    content: (
      <div className="text-right" dir="rtl">
        <h3 className="text-lg font-bold text-slate-800 mb-2">הסייען החכם שלכם 🤖</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          לחצו כאן כדי לשוחח עם ה-Copilot מבוסס הבינה המלאכותית שלנו. תוכלו להדביק טקסט עם פרטי נכסים או להעלות קבצי אקסל, והמערכת תשאב את הנתונים אוטומטית.
        </p>
      </div>
    ),
  },
  {
    target: '.tour-webot',
    content: (
      <div className="text-right" dir="rtl">
        <h3 className="text-lg font-bold text-slate-800 mb-2">WeBot והתאמות קסם ✨</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          צרו קטלוג דיגיטלי אישי (מיני-סייט) לכל לקוח בקליק אחד. כשלקוחות 'לייקקו' נכס, זה מסתנכרן חזרה ישירות לכאן, ל-CRM שלכם.
        </p>
      </div>
    ),
  },
  {
    target: '.tour-whatsapp-control',
    content: (
      <div className="text-right" dir="rtl">
        <h3 className="text-lg font-bold text-slate-800 mb-2">חירום? כבו את הבוט 🛑</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          הבוט עונה ללידים שלכם אוטומטית. רוצים לקחת שליטה ידנית? פשוט כבו אותו פה. הוא גם נכבה מעצמו כשהלקוח מבקש לדבר עם נציג אנושי.
        </p>
      </div>
    ),
  },
  {
    target: '.tour-kanban',
    content: (
      <div className="text-right" dir="rtl">
        <h3 className="text-lg font-bold text-slate-800 mb-2">ניהול עסקאות 📈</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          גררו ושחררו לידים בין השלבים השונים. הגיע הזמן לסגור יותר עסקאות!
        </p>
      </div>
    ),
  },
];

export default function OnboardingTour() {
  const { userData } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Only run if the user data is loaded and they haven't seen the tour yet
    if (userData && userData.uid && userData.hasSeenTour !== true) {
        // Small delay to ensure the DOM elements (targets) are fully rendered
        const timer = setTimeout(() => {
            setRun(true);
        }, 1500);
        return () => clearTimeout(timer);
    }
  }, [userData]);

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      if (userData?.uid) {
        try {
          await markTourAsSeen(userData.uid);
        } catch (error) {
          console.error('Failed to mark tour as seen:', error);
        }
      }
    }
  };

  if (!run) return null;

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      run={run}
      steps={tourSteps}
      showProgress
      showSkipButton
      locale={{
        back: 'חזור',
        close: 'סגור',
        last: 'סיום',
        next: 'הבא',
        skip: 'דלג על הסיור',
      }}
      styles={{
        options: {
          arrowColor: '#ffffff',
          backgroundColor: '#ffffff',
          overlayColor: 'rgba(15, 23, 42, 0.6) /* Tailwind slate-900 with 60% opacity */',
          primaryColor: '#2563eb', /* Tailwind blue-600 */
          textColor: '#1e293b', /* Tailwind slate-800 */
          width: 400,
          zIndex: 1000,
        },
        tooltipContainer: {
          textAlign: 'right',
          direction: 'rtl',
        },
        buttonNext: {
          backgroundColor: '#2563eb',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '14px',
          padding: '8px 16px',
        },
        buttonBack: {
          marginRight: 10,
          color: '#64748b', /* Tailwind slate-500 */
          fontWeight: 600,
        },
        buttonSkip: {
          color: '#94a3b8', /* Tailwind slate-400 */
          fontWeight: 600,
        },
        tooltip: {
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        }
      }}
    />
  );
}
