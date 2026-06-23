import React, { useState, useRef, useEffect } from 'react';

interface InteractiveCarCardProps {
  name: string;
  type: 'sedan' | 'sports' | 'suv' | 'compact';
  color: string;
  batteryLevel: number;
  isCharging: boolean;
  statusText: string;
  specs: { label: string; value: string }[];
  initialYaw?: number;
}

// Color shading helper
function shadeColor(color: string, percent: number) {
  let num = parseInt(color.replace("#", ""), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    G = ((num >> 8) & 0x00ff) + amt,
    B = (num & 0x0000ff) + amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 0 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 0 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 0 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}

export default function InteractiveCarCard({
  name,
  type,
  color,
  batteryLevel,
  isCharging,
  statusText,
  specs,
  initialYaw = 35
}: InteractiveCarCardProps) {
  const [hoverYaw, setHoverYaw] = useState(initialYaw);
  const [hoverPitch, setHoverPitch] = useState(25);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Natural idle sway animation when not hovered
  useEffect(() => {
    let start = Date.now();
    const idleLoop = () => {
      if (!isHovered) {
        const elapsed = (Date.now() - start) / 1000;
        // Slow gentle breathing sway
        setHoverYaw(initialYaw + Math.sin(elapsed * 1.5) * 6);
        setHoverPitch(24 + Math.cos(elapsed * 1.0) * 2);
      }
      animationRef.current = requestAnimationFrame(idleLoop);
    };
    animationRef.current = requestAnimationFrame(idleLoop);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isHovered, initialYaw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    setIsHovered(true);
    const rect = containerRef.current.getBoundingClientRect();
    const xFraction = (e.clientX - rect.left) / rect.width; // 0 to 1
    const yFraction = (e.clientY - rect.top) / rect.height; // 0 to 1

    // Map mouse X to a ±30 degree yaw rotation from initialYaw
    const targetYaw = initialYaw - 35 + xFraction * 70;
    // Map mouse Y to a pitch tilt
    const targetPitch = 18 + yFraction * 14;

    // Linear interpolate gently for responsiveness
    setHoverYaw(prev => prev + (targetYaw - prev) * 0.15);
    setHoverPitch(prev => prev + (targetPitch - prev) * 0.15);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // 3D Isometric math
  const width = 160;
  const height = 110;
  const scale = 40;

  const project = (x: number, y: number, z: number = 0) => {
    const yawRad = (hoverYaw * Math.PI) / 180;
    const pitchRad = (hoverPitch * Math.PI) / 180;

    // 1. Yaw rotation around Z axis
    const rx = x * Math.cos(yawRad) - y * Math.sin(yawRad);
    const ry = x * Math.sin(yawRad) + y * Math.cos(yawRad);
    const rz = z;

    // 2. Pitch rotation around X axis
    const projX = rx;
    const projY = ry * Math.cos(pitchRad) - rz * Math.sin(pitchRad);

    return {
      x: width / 2 + projX * scale,
      y: height / 2 + projY * scale + 15 // push down slightly
    };
  };

  // Dimensions based on car class
  let w = 0.52;
  let l = 0.95;
  let h = 0.48;

  if (type === 'sports') {
    w = 0.56;
    l = 1.02;
    h = 0.38;
  } else if (type === 'suv') {
    w = 0.54;
    l = 0.90;
    h = 0.58;
  } else if (type === 'compact') {
    w = 0.46;
    l = 0.76;
    h = 0.50;
  }

  // Calculate coordinates
  // Base Corners
  const bFL = project(-w, -l, 0);
  const bFR = project(w, -l, 0);
  const bBR = project(w, l, 0);
  const bBL = project(-w, l, 0);

  // Mudguard top
  const mFL = project(-w, -l, h * 0.4);
  const mFR = project(w, -l, h * 0.4);
  const mBR = project(w, l, h * 0.4);
  const mBL = project(-w, l, h * 0.4);

  // Roof cap points
  const rFPercent = type === 'suv' ? -0.15 : -0.05;
  const rBPercent = type === 'suv' ? 0.85 : 0.65;
  const rWWidth = type === 'compact' ? 0.82 : 0.72;

  const tFL = project(-w * rWWidth, -l * rFPercent, h * 0.94);
  const tFR = project(w * rWWidth, -l * rFPercent, h * 0.94);
  const tBR = project(w * rWWidth, l * rBPercent, h * 0.94);
  const tBL = project(-w * rWWidth, l * rBPercent, h * 0.94);

  // Shading colors
  const lightColor = color;
  const bodyDark = shadeColor(color, -20);
  const bodyMedium = shadeColor(color, -10);
  const bodyDeep = shadeColor(color, -28);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="bg-transparent select-none text-center flex flex-col items-center justify-center relative group transition-all duration-305 w-full h-full cursor-grab active:cursor-grabbing"
    >
      {/* 3D Isometric Viewport Canvas */}
      <div className="h-[120px] w-full flex items-center justify-center relative overflow-visible select-none pointer-events-none">
        
        {/* Glow behind the model pedestal */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full transition-all duration-500 blur-2xl -z-10 ${
          isHovered 
            ? 'bg-teal-400/15 scale-125' 
            : 'bg-zinc-400/5 scale-100'
        }`} />

        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="z-10 overflow-visible">
          <defs>
            <radialGradient id={`pedestal-glow-${name.replace(/\s+/g, '')}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={isHovered ? "#0ea5e9" : "#0d9488"} stopOpacity={isHovered ? "0.35" : "0.2"} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Hologram Turntable Pedestal Base */}
          <ellipse
            cx={width / 2}
            cy={height / 2 + 18}
            rx="44"
            ry="15"
            fill={`url(#pedestal-glow-${name.replace(/\s+/g, '')})`}
          />
          <ellipse
            cx={width / 2}
            cy={height / 2 + 18}
            rx="35"
            ry="10"
            fill="none"
            stroke={isHovered ? '#0ea5e9' : '#a1a1aa'}
            strokeWidth={isHovered ? "1.5" : "0.8"}
            strokeOpacity={isHovered ? '0.85' : '0.4'}
            strokeDasharray={isHovered ? 'none' : '4 4'}
            className="transition-all duration-300"
          />

          {/* Underglow Ground Spot Light projection */}
          <polygon
            points={`${project(-w - 0.2, -l - 0.2).x},${project(-w - 0.2, -l - 0.2).y} ${project(w + 0.2, -l - 0.2).x},${project(w + 0.2, -l - 0.2).y} ${project(w + 0.2, l + 0.2).x},${project(w + 0.2, l + 0.2).y} ${project(-w - 0.2, l + 0.2).x},${project(-w - 0.2, l + 0.2).y}`}
            fill={isCharging ? "rgba(56, 189, 248, 0.15)" : "rgba(34, 197, 94, 0.12)"}
            className="transition-all duration-350"
          />

          {/* 3D Car Vector Drawing */}
          <g>
            {/* Wheels */}
            <ellipse cx={project(-w - 0.01, -l * 0.4, 0.06).x} cy={project(-w - 0.01, -l * 0.4, 0.06).y} rx={2.2} ry={3.8} className="fill-zinc-900" />
            <ellipse cx={project(w + 0.01, -l * 0.4, 0.06).x} cy={project(w + 0.01, -l * 0.4, 0.06).y} rx={2.2} ry={3.8} className="fill-zinc-900" />
            <ellipse cx={project(-w - 0.01, l * 0.5, 0.06).x} cy={project(-w - 0.01, l * 0.5, 0.06).y} rx={2.2} ry={3.8} className="fill-zinc-900" />
            <ellipse cx={project(w + 0.01, l * 0.5, 0.06).x} cy={project(w + 0.01, l * 0.5, 0.06).y} rx={2.2} ry={3.8} className="fill-zinc-900" />
            
            <circle cx={project(-w - 0.01, -l * 0.4, 0.06).x} cy={project(-w - 0.01, -l * 0.4, 0.06).y} r={0.8} className="fill-zinc-400" />
            <circle cx={project(w + 0.01, -l * 0.4, 0.06).x} cy={project(w + 0.01, -l * 0.4, 0.06).y} r={0.8} className="fill-zinc-400" />
            <circle cx={project(-w - 0.01, l * 0.5, 0.06).x} cy={project(-w - 0.01, l * 0.5, 0.06).y} r={0.8} className="fill-zinc-400" />
            <circle cx={project(w + 0.01, l * 0.5, 0.06).x} cy={project(w + 0.01, l * 0.5, 0.06).y} r={0.8} className="fill-zinc-400" />

            {/* Car Lower Chassis Panels */}
            {/* Front Panel */}
            <polygon
              points={`${bFL.x},${bFL.y} ${bFR.x},${bFR.y} ${mFR.x},${mFR.y} ${mFL.x},${mFL.y}`}
              fill={bodyDark}
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="0.4"
            />
            {/* Sides */}
            <polygon
              points={`${bFL.x},${bFL.y} ${bBL.x},${bBL.y} ${mBL.x},${mBL.y} ${mFL.x},${mFL.y}`}
              fill={bodyMedium}
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="0.4"
            />
            <polygon
              points={`${bFR.x},${bFR.y} ${bBR.x},${bBR.y} ${mBR.x},${mBR.y} ${mFR.x},${mFR.y}`}
              fill={bodyMedium}
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="0.4"
            />
            {/* Rear */}
            <polygon
              points={`${bBL.x},${bBL.y} ${bBR.x},${bBR.y} ${mBR.x},${mBR.y} ${mBL.x},${mBL.y}`}
              fill={bodyDeep}
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="0.4"
            />

            {/* Hood Cover flat design */}
            <polygon
              points={`${mFL.x},${mFL.y} ${mFR.x},${mFR.y} ${project(w, -l * 0.15, h * 0.44).x},${project(w, -l * 0.15, h * 0.44).y} ${project(-w, -l * 0.15, h * 0.44).x},${project(-w, -l * 0.15, h * 0.44).y}`}
              fill={lightColor}
            />

            {/* Windshield */}
            <polygon
              points={`${project(-w * 0.85, -l * 0.12, h * 0.44).x},${project(-w * 0.85, -l * 0.12, h * 0.44).y} ${project(w * 0.85, -l * 0.12, h * 0.44).x},${project(w * 0.85, -l * 0.12, h * 0.44).y} ${tFR.x},${tFR.y} ${tFL.x},${tFL.y}`}
              fill="#1e293b"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.4"
            />

            {/* Cab side windows */}
            <polygon
              points={`${tFL.x},${tFL.y} ${tBL.x},${tBL.y} ${project(-w * rWWidth * 1.15, l * rBPercent + 0.05, h * 0.44).x},${project(-w * rWWidth * 1.15, l * rBPercent + 0.05, h * 0.44).y} ${project(-w * rWWidth * 1.15, -l * rFPercent, h * 0.44).x},${project(-w * rWWidth * 1.15, -l * rFPercent, h * 0.44).y}`}
              fill="#334155"
            />
            <polygon
              points={`${tFR.x},${tFR.y} ${tBR.x},${tBR.y} ${project(w * rWWidth * 1.15, l * rBPercent + 0.05, h * 0.44).x},${project(w * rWWidth * 1.15, l * rBPercent + 0.05, h * 0.44).y} ${project(w * rWWidth * 1.15, -l * rFPercent, h * 0.44).x},${project(w * rWWidth * 1.15, -l * rFPercent, h * 0.44).y}`}
              fill="#334155"
            />

            {/* Roof Top */}
            <polygon
              points={`${tFL.x},${tFL.y} ${tFR.x},${tFR.y} ${tBR.x},${tBR.y} ${tBL.x},${tBL.y}`}
              fill={lightColor}
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="0.4"
            />

            {/* Spoiler (Only for sports cars) */}
            {type === 'sports' && (
              <g>
                <line
                  x1={project(-w * 0.72, l * 0.9, h * 0.45).x}
                  y1={project(-w * 0.72, l * 0.9, h * 0.45).y}
                  x2={project(-w * 0.72, l * 0.9, h * 0.65).x}
                  y2={project(-w * 0.72, l * 0.9, h * 0.65).y}
                  stroke="#111827"
                  strokeWidth="1.2"
                />
                <line
                  x1={project(w * 0.72, l * 0.9, h * 0.45).x}
                  y1={project(w * 0.72, l * 0.9, h * 0.45).y}
                  x2={project(w * 0.72, l * 0.9, h * 0.65).x}
                  y2={project(w * 0.72, l * 0.9, h * 0.65).y}
                  stroke="#111827"
                  strokeWidth="1.2"
                />
                <polygon
                  points={`${project(-w * 0.85, l * 0.86, h * 0.65).x},${project(-w * 0.85, l * 0.86, h * 0.65).y} ${project(w * 0.85, l * 0.86, h * 0.65).x},${project(w * 0.85, l * 0.86, h * 0.65).y} ${project(w * 0.85, l * 0.98, h * 0.63).x},${project(w * 0.85, l * 0.98, h * 0.63).y} ${project(-w * 0.85, l * 0.98, h * 0.63).x},${project(-w * 0.85, l * 0.98, h * 0.63).y}`}
                  fill={bodyDeep}
                />
              </g>
            )}

            {/* Glowing headlights */}
            <ellipse cx={project(-w * 0.58, -l * 0.98, h * 0.22).x} cy={project(-w * 0.58, -l * 0.98, h * 0.22).y} rx={1.8} ry={1.2} className="fill-amber-300 animate-pulse" />
            <ellipse cx={project(w * 0.58, -l * 0.98, h * 0.22).x} cy={project(w * 0.58, -l * 0.98, h * 0.22).y} rx={1.8} ry={1.2} className="fill-amber-300 animate-pulse" />
          </g>
        </svg>
      </div>

      {/* Futuristic Holographic Floating Label nameplate */}
      <div className="mt-1 transition-all duration-300">
        <span className="font-mono text-[9px] font-extrabold tracking-widest text-zinc-500/80 group-hover:text-teal-600 transition-colors uppercase block">
          ⚡ {name}
        </span>
        <span className="text-[7px] font-mono font-medium text-zinc-400 opacity-0 group-hover:opacity-85 transition-opacity block mt-0.5 tracking-wider">
          {isCharging ? `Đang sạc • ${batteryLevel}%` : `Đã sạc • Sẵn sàng`}
        </span>
      </div>
    </div>
  );
}
