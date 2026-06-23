import React, { useState, useRef } from 'react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export default function TiltCard({ children, className = '', intensity = 12 }: TiltCardProps) {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    
    // Normalize coordinates to -0.5 to 0.5
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    
    // Rotate card around corresponding axis
    setRotation({
      x: -y * intensity,
      y: x * intensity
    });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotation({ x: 0, y: 0 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`transition-all duration-200 select-none ${className}`}
      style={{
        transform: isHovered 
          ? `perspective(1000px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale(1.04)`
          : `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)`,
        transformStyle: 'preserve-3d',
        transition: isHovered ? 'transform 0.05s linear' : 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)',
      }}
    >
      <div style={{ transform: 'translateZ(24px)', transformStyle: 'preserve-3d' }} className="h-full">
        {children}
      </div>
    </div>
  );
}
