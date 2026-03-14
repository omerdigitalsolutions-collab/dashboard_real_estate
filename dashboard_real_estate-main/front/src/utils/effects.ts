import confetti from 'canvas-confetti';

/**
 * Triggers a celebratory confetti animation
 */
export const triggerWonConfetti = () => {
  const duration = 3 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

  const randomInRange = (min: number, max: number) => {
    return Math.random() * (max - min) + min;
  };

  const interval: any = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    
    // Launch from left
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      colors: ['#10b981', '#3b82f6', '#f59e0b', '#ffffff']
    });
    // Launch from right
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      colors: ['#10b981', '#3b82f6', '#f59e0b', '#ffffff']
    });
  }, 250);
};

/**
 * Triggers a simple burst of confetti
 */
export const triggerSimpleBurst = () => {
  confetti({
    particleCount: 150,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#10b981', '#3b82f6', '#f59e0b', '#ffffff'],
    zIndex: 10000
  });
};
