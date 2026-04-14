import { useEffect, useState } from "react";

export const Confetti = ({ trigger }: { trigger: boolean }) => {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; size: number; delay: number }[]>([]);

  useEffect(() => {
    if (trigger) {
      const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];
      const newParticles = Array.from({ length: 50 }).map((_, i) => ({
        id: Math.random(),
        x: Math.random() * 100,
        y: -10,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 10 + 5,
        delay: Math.random() * 2,
      }));
      setParticles(newParticles);
      const timer = setTimeout(() => setParticles([]), 4000);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <style>{`
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .confetti-particle {
          position: absolute;
          animation: fall 3s linear forwards;
        }
      `}</style>
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            backgroundColor: p.color,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
};
