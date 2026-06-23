import React, { useState, useRef, useEffect } from 'react';
import { ParkingSlot, Gate } from '../types';

interface IsometricViewProps {
  slots: ParkingSlot[];
  gates: Gate[];
  selectedSlotId: number | null;
  onSelectSlot: (id: number) => void;
}

export default function IsometricView({
  slots,
  gates,
  selectedSlotId,
  onSelectSlot,
}: IsometricViewProps) {
  // Interactive Camera Controls (Horizontal and Vertical 3D rotation)
  const [yaw, setYaw] = useState<number>(315); // angle around Z-axis (horizontal)
  const [pitch, setPitch] = useState<number>(45); // angle around X-axis (vertical tilt)
  const [zoom, setZoom] = useState<number>(1.0);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showLasers, setShowLasers] = useState<boolean>(true);
  const [showFoliage, setShowFoliage] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);

  // --- TRAFFIC TRANSITION ANIMATION STATES ---
  interface AnimatingCar {
    id: string;
    slotId: number;
    color: string;
    type: 'entering' | 'exiting';
    progress: number; // 0 to 1
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  }

  const [animatingCars, setAnimatingCars] = useState<AnimatingCar[]>([]);
  const prevSlotsRef = useRef<ParkingSlot[]>([]);

  // Monitor slots changes to trigger enter/exit animations dynamically
  useEffect(() => {
    if (prevSlotsRef.current.length === 0 && slots.length > 0) {
      prevSlotsRef.current = JSON.parse(JSON.stringify(slots));
      return;
    }

    slots.forEach((currentSlot) => {
      const prevSlot = prevSlotsRef.current.find((s) => s.id === currentSlot.id);
      if (!prevSlot) return;

      const position = slotPositions.find((p) => p.id === currentSlot.id);
      if (!position) return;

      const wasEmpty = prevSlot.status === 'empty';
      const isOccupied = currentSlot.status === 'occupied';

      // Transition from FREE -> OCCUPIED
      if (wasEmpty && isOccupied) {
        const carColor = currentSlot.car?.color || '#ef4444'; // default red
        setAnimatingCars((prev) => [
          ...prev.filter(c => c.slotId !== currentSlot.id),
          {
            id: `enter-${currentSlot.id}-${Date.now()}`,
            slotId: currentSlot.id,
            color: carColor,
            type: 'entering',
            progress: 0,
            startX: -3.8,
            startY: 4.8, // Start slightly before the entry gate base
            endX: position.x,
            endY: position.y,
          }
        ]);
      } 
      // Transition from OCCUPIED -> FREE
      else if (!wasEmpty && !isOccupied) {
        const carColor = prevSlot.car?.color || '#ef4444';
        setAnimatingCars((prev) => [
          ...prev.filter(c => c.slotId !== currentSlot.id),
          {
            id: `exit-${currentSlot.id}-${Date.now()}`,
            slotId: currentSlot.id,
            color: carColor,
            type: 'exiting',
            progress: 0,
            startX: position.x,
            startY: position.y,
            endX: 3.8,
            endY: 4.8, // Exit slightly past the barrier
          }
        ]);
      }
    });

    prevSlotsRef.current = JSON.parse(JSON.stringify(slots));
  }, [slots]);

  // RequestAnimationFrame high-frequency ticker for physical movement simulation
  useEffect(() => {
    if (animatingCars.length === 0) return;

    let frameId: number;
    let lastTime = performance.now();

    const step = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      const stepSize = delta / 2500; // 2.5 seconds transit time

      setAnimatingCars((prev) => {
        if (prev.length === 0) return prev;
        return prev
          .map((c) => ({
            ...c,
            progress: c.progress + stepSize,
          }))
          .filter((c) => c.progress < 1.0);
      });

      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [animatingCars.length]);

  // States for Pointer Dragging (Rotate on both axes)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartYaw = useRef<number>(315);
  const dragStartPitch = useRef<number>(45);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport Settings
  const width = 800;
  const height = 480;
  const centerX = width / 2;
  const centerY = height / 2 + 15;
  const scale = 47.5; // logical unit size for projection - expanded so model fits the container frame perfectly

  // Smooth cinematic auto-rotation loop
  useEffect(() => {
    if (!autoRotate) return;
    let frameId: number;
    const rotateLoop = () => {
      setYaw((prev) => (prev + 0.05) % 360);
      frameId = requestAnimationFrame(rotateLoop);
    };
    frameId = requestAnimationFrame(rotateLoop);
    return () => cancelAnimationFrame(frameId);
  }, [autoRotate]);

  // Smoothly interpolated barrier gate arm angles in 3D
  const [entranceArmAngle, setEntranceArmAngle] = useState(0);
  const [exitArmAngle, setExitArmAngle] = useState(0);

  useEffect(() => {
    let frameId: number;
    const updateAngles = () => {
      const isEntOpen = gates.find((g) => g.id === 'entrance')?.status === 'open' || 
                        animatingCars.some((c) => c.type === 'entering' && c.progress <= 0.45);
      const isExtOpen = gates.find((g) => g.id === 'exit')?.status === 'open' || 
                        animatingCars.some((c) => c.type === 'exiting' && c.progress >= 0.55);

      const targetEntrance = isEntOpen ? 80 : 0;
      const targetExit = isExtOpen ? 80 : 0;

      setEntranceArmAngle((prev) => {
        const diff = targetEntrance - prev;
        if (Math.abs(diff) < 0.1) return targetEntrance;
        return prev + diff * 0.12;
      });

      setExitArmAngle((prev) => {
        const diff = targetExit - prev;
        if (Math.abs(diff) < 0.1) return targetExit;
        return prev + diff * 0.12;
      });

      frameId = requestAnimationFrame(updateAngles);
    };
    frameId = requestAnimationFrame(updateAngles);
    return () => cancelAnimationFrame(frameId);
  }, [gates, animatingCars]);

  // Mathematical Projection Matrix (3D Rotation with Yaw & Pitch)
  const project = (x: number, y: number, z: number = 0) => {
    const yawRad = (yaw * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;

    // 1. Rotate around Z-axis (Yaw - Horizontal)
    const rx = x * Math.cos(yawRad) - y * Math.sin(yawRad);
    const ry = x * Math.sin(yawRad) + y * Math.cos(yawRad);
    const rz = z;

    // 2. Rotate around X-axis (Pitch - Vertical Tilt)
    const projX = rx;
    const projY = ry * Math.cos(pitchRad) - rz * Math.sin(pitchRad);

    return {
      x: centerX + projX * scale * zoom,
      y: centerY + projY * scale * zoom,
    };
  };

  // Generate 3D foundation slab coordinates (Concrete base plate)
  const getSlabPoints = () => {
    const sizeX = 5.6; 
    const sizeY = 4.8; 
    const depth = -0.35;

    const p1 = project(-sizeX, -sizeY, 0);
    const p2 = project(sizeX, -sizeY, 0);
    const p3 = project(sizeX, sizeY, 0);
    const p4 = project(-sizeX, sizeY, 0);

    const d1 = project(-sizeX, -sizeY, depth);
    const d2 = project(sizeX, -sizeY, depth);
    const d3 = project(sizeX, sizeY, depth);
    const d4 = project(-sizeX, sizeY, depth);

    return {
      top: `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`,
      left: `${p1.x},${p1.y} ${p4.x},${p4.y} ${d4.x},${d4.y} ${d1.x},${d1.y}`,
      right: `${p3.x},${p3.y} ${p4.x},${p4.y} ${d4.x},${d4.y} ${d3.x},${d3.y}`,
      front: `${p2.x},${p2.y} ${p3.x},${p3.y} ${d3.x},${d3.y} ${d2.x},${d2.y}`,
    };
  };

  const slab = getSlabPoints();

  // Grid mesh overlaying deck
  const renderGridLines = () => {
    if (!showGrid) return null;
    const sizeX = 5.6;
    const sizeY = 4.8;
    const step = 0.8;
    const lines = [];

    // Parallel to Y axis
    for (let x = -sizeX; x <= sizeX; x += step) {
      const pStart = project(x, -sizeY, 0);
      const pEnd = project(x, sizeY, 0);
      lines.push(
        <line
          key={`g-x-${x.toFixed(2)}`}
          x1={pStart.x}
          y1={pStart.y}
          x2={pEnd.x}
          y2={pEnd.y}
          className="stroke-zinc-300/40"
          strokeWidth="0.5"
        />
      );
    }

    // Parallel to X axis
    for (let y = -sizeY; y <= sizeY; y += step) {
      const pStart = project(-sizeX, y, 0);
      const pEnd = project(sizeX, y, 0);
      lines.push(
        <line
          key={`g-y-${y.toFixed(2)}`}
          x1={pStart.x}
          y1={pStart.y}
          x2={pEnd.x}
          y2={pEnd.y}
          className="stroke-zinc-300/40"
          strokeWidth="0.5"
        />
      );
    }

    return lines;
  };

  const slotPositions = [
    { id: 1, x: -3.75, y: -1.3 },
    { id: 2, x: -2.25, y: -1.3 },
    { id: 3, x: -0.75, y: -1.3 },
    { id: 4, x: 0.75, y: -1.3 },
    { id: 5, x: 2.25, y: -1.3 },
    { id: 6, x: 3.75, y: -1.3 },
  ];

  // Shading color helper function
  function shadeColor(color: string, percent: number) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = parseInt(((R * (100 + percent)) / 100).toString());
    G = parseInt(((G * (100 + percent)) / 100).toString());
    B = parseInt(((B * (100 + percent)) / 100).toString());

    R = R < 255 ? R : 255;
    G = G < 255 ? G : 255;
    B = B < 255 ? B : 255;

    R = R > 0 ? R : 0;
    G = G > 0 ? G : 0;
    B = B > 0 ? B : 0;

    const rHex = R.toString(16).length === 1 ? '0' + R.toString(16) : R.toString(16);
    const gHex = G.toString(16).length === 1 ? '0' + G.toString(16) : G.toString(16);
    const bHex = B.toString(16).length === 1 ? '0' + B.toString(16) : B.toString(16);

    return `#${rHex}${gHex}${bHex}`;
  }

  // Pointer Interaction Events for Drag-to-Rotate on 2 Axes
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setAutoRotate(false); // Stop auto-rotate on manual drag
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragStartYaw.current = yaw;
    dragStartPitch.current = pitch;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    
    const sensitivityX = 0.55;
    const sensitivityY = 0.55;

    // Horizontal Yaw is cyclical 0 -> 360 (Inverted direction to follow mouse)
    const newYaw = (dragStartYaw.current + deltaX * sensitivityX) % 360;
    const cleanYaw = newYaw < 0 ? newYaw + 360 : newYaw;

    // Vertical Pitch has safety caps (Inverted direction to follow mouse)
    const newPitch = dragStartPitch.current - deltaY * sensitivityY;
    const cleanPitch = Math.max(12, Math.min(84, newPitch));

    setYaw(cleanYaw);
    setPitch(cleanPitch);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Native non-passive Wheel Listener to prevent page scrolling while zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.05 : -0.05;
      setZoom((prev) => Math.min(Math.max(0.6, prev + factor), 2.2));
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  // Render 3D Plants box ornamentation at the back edge of the slab for decoration
  const renderPlanterDecoration = () => {
    if (!showFoliage) return null;
    const sizeX = 5.2;
    const py = -4.5;
    const h = 0.25;
    const w = 0.22;

    const baseLeft = project(-sizeX, py, 0);
    const baseRight = project(sizeX, py, 0);
    const topLeft = project(-sizeX, py, h);
    const topRight = project(sizeX, py, h);

    const backLeft = project(-sizeX, py - w, 0);
    const backRight = project(sizeX, py - w, 0);
    const topBackLeft = project(-sizeX, py - w, h);
    const topBackRight = project(sizeX, py - w, h);

    // Create 3D bush leaves bubbles
    const leaves = [];
    const step = 0.45;
    for (let x = -sizeX + 0.2; x <= sizeX - 0.2; x += step) {
      const plantCenter = project(x, py - w/2, h + 0.06);
      const r1 = 9 * zoom;
      const r2 = 6 * zoom;

      leaves.push(
        <g key={`leaves-${x.toFixed(2)}`}>
          {/* Main green bubble */}
          <circle cx={plantCenter.x} cy={plantCenter.y} r={r1} className="fill-[#15803d]" />
          {/* Light overlay highlights */}
          <circle cx={plantCenter.x - 2} cy={plantCenter.y - 2} r={r2} className="fill-[#22c55e]" />
          <circle cx={plantCenter.x + 3} cy={plantCenter.y + 1} r={r2 * 0.8} className="fill-[#166534]" />
        </g>
      );
    }

    return (
      <g id="foliage-planter">
        {/* Render 3D planter box container */}
        <polygon
          points={`${backLeft.x},${backLeft.y} ${backRight.x},${backRight.y} ${topBackRight.x},${topBackRight.y} ${topBackLeft.x},${topBackLeft.y}`}
          className="fill-zinc-800"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        />
        <polygon
          points={`${baseLeft.x},${baseLeft.y} ${baseRight.x},${baseRight.y} ${topRight.x},${topRight.y} ${topLeft.x},${topLeft.y}`}
          className="fill-zinc-650"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.5"
        />
        <polygon
          points={`${topLeft.x},${topLeft.y} ${topRight.x},${topRight.y} ${topBackRight.x},${topBackRight.y} ${topBackLeft.x},${topBackLeft.y}`}
          className="fill-zinc-700"
        />
        {/* Leaves spheres */}
        {leaves}
      </g>
    );
  };

  // Render 3D Cars with highly polished, beautiful custom details suitable for gasoline motor vehicles
  const renderCar = (x: number, y: number, inputColor: string) => {
    const w = 0.52; // width
    const l = 0.95; // length
    const h = 0.50; // height

    // Beautiful matte coloring palette
    let baseColor = '#4b5563'; 
    if (inputColor === '#06b6d4' || inputColor === '#0ea5e9') baseColor = '#0284c7'; 
    else if (inputColor === '#ef4444' || inputColor === '#f43f5e') baseColor = '#be123c'; 
    else if (inputColor === '#eab308') baseColor = '#d97706'; 
    else if (inputColor === '#10b981') baseColor = '#0f766e'; 
    else if (inputColor === '#ffffff') baseColor = '#f4f4f5'; 
    else if (inputColor === '#a855f7') baseColor = '#7e22ce'; 

    const lightColor = baseColor;
    const bodyDark = shadeColor(baseColor, -18);
    const bodyMedium = shadeColor(baseColor, -8);
    const bodyDeep = shadeColor(baseColor, -25);

    // Coordinate matrices
    const bFL = project(x - w, y - l, 0);
    const bFR = project(x + w, y - l, 0);
    const bBR = project(x + w, y + l, 0);
    const bBL = project(x - w, y + l, 0);

    const mFL = project(x - w, y - l, h * 0.4);
    const mFR = project(x + w, y - l, h * 0.4);
    const mBR = project(x + w, y + l, h * 0.4);
    const mBL = project(x - w, y + l, h * 0.4);

    const tFL = project(x - w * 0.72, y - l * 0.05, h * 0.95);
    const tFR = project(x + w * 0.72, y - l * 0.05, h * 0.95);
    const tBR = project(x + w * 0.72, y + l * 0.7, h * 0.95);
    const tBL = project(x - w * 0.72, y + l * 0.7, h * 0.95);

    return (
      <g className="transition-all duration-700 ease-out">
        {/* Semi-transparent ground shadow overlay */}
        <polygon
          points={`${project(x - w - 0.15, y - l - 0.15, 0).x},${project(x - w - 0.15, y - l - 0.15, 0).y} ${project(x + w + 0.15, y - l - 0.15, 0).x},${project(x + w + 0.15, y - l - 0.15, 0).y} ${project(x + w + 0.15, y + l + 0.15, 0).x},${project(x + w + 0.15, y + l + 0.15, 0).y} ${project(x - w - 0.15, y + l + 0.15, 0).x},${project(x - w - 0.15, y + l + 0.15, 0).y}`}
          className="fill-zinc-800/25 animate-pulse"
        />

        {/* Wheels with chrome rims detailing */}
        <ellipse cx={project(x - w - 0.02, y - l * 0.4, 0.07).x} cy={project(x - w - 0.02, y - l * 0.4, 0.07).y} rx={2.5} ry={4.5} className="fill-[#111827]" />
        <ellipse cx={project(x + w + 0.02, y - l * 0.4, 0.07).x} cy={project(x + w + 0.02, y - l * 0.4, 0.07).y} rx={2.5} ry={4.5} className="fill-[#111827]" />
        <ellipse cx={project(x - w - 0.02, y + l * 0.52, 0.07).x} cy={project(x - w - 0.02, y + l * 0.52, 0.07).y} rx={2.5} ry={4.5} className="fill-[#111827]" />
        <ellipse cx={project(x + w + 0.02, y + l * 0.52, 0.07).x} cy={project(x + w + 0.02, y + l * 0.52, 0.07).y} rx={2.5} ry={4.5} className="fill-[#111827]" />

        {/* Deep wheel hubs silver caps */}
        <circle cx={project(x - w - 0.02, y - l * 0.4, 0.07).x} cy={project(x - w - 0.02, y - l * 0.4, 0.07).y} r={1} className="fill-zinc-300" />
        <circle cx={project(x + w + 0.02, y - l * 0.4, 0.07).x} cy={project(x + w + 0.02, y - l * 0.4, 0.07).y} r={1} className="fill-zinc-300" />
        <circle cx={project(x - w - 0.02, y + l * 0.52, 0.07).x} cy={project(x - w - 0.02, y + l * 0.52, 0.07).y} r={1} className="fill-zinc-300" />
        <circle cx={project(x + w + 0.02, y + l * 0.52, 0.07).x} cy={project(x + w + 0.02, y + l * 0.52, 0.07).y} r={1} className="fill-zinc-300" />

        {/* Lower Car Chassis Front Plate */}
        <polygon
          points={`${bFL.x},${bFL.y} ${bFR.x},${bFR.y} ${mFR.x},${mFR.y} ${mFL.x},${mFL.y}`}
          fill={bodyDark}
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="0.5"
        />

        {/* Lower Car Sides */}
        <polygon
          points={`${bFL.x},${bFL.y} ${bBL.x},${bBL.y} ${mBL.x},${mBL.y} ${mFL.x},${mFL.y}`}
          fill={bodyMedium}
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="0.5"
        />
        <polygon
          points={`${bFR.x},${bFR.y} ${bBR.x},${bBR.y} ${mBR.x},${mBR.y} ${mFR.x},${mFR.y}`}
          fill={bodyMedium}
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="0.5"
        />
        {/* Rear panel */}
        <polygon
          points={`${bBL.x},${bBL.y} ${bBR.x},${bBR.y} ${mBR.x},${mBR.y} ${mBL.x},${mBL.y}`}
          fill={bodyDeep}
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="0.5"
        />

        {/* Hood Top flat plane */}
        <polygon
          points={`${mFL.x},${mFL.y} ${mFR.x},${mFR.y} ${project(x + w, y - l * 0.2, h * 0.45).x},${project(x + w, y - l * 0.2, h * 0.45).y} ${project(x - w, y - l * 0.2, h * 0.45).x},${project(x - w, y - l * 0.2, h * 0.45).y}`}
          fill={lightColor}
        />

        {/* Front Windshield window glass */}
        <polygon
          points={`${project(x - w * 0.85, y - l * 0.15, h * 0.45).x},${project(x - w * 0.85, y - l * 0.15, h * 0.45).y} ${project(x + w * 0.85, y - l * 0.15, h * 0.45).x},${project(x + w * 0.85, y - l * 0.15, h * 0.45).y} ${tFR.x},${tFR.y} ${tFL.x},${tFL.y}`}
          fill="#1e293b"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.5"
        />

        {/* Cabin Glass and pillars */}
        <polygon
          points={`${tFL.x},${tFL.y} ${tBL.x},${tBL.y} ${project(x - w * 0.9, y + l * 0.72, h * 0.42).x},${project(x - w * 0.9, y + l * 0.72, h * 0.42).y} ${project(x - w * 0.9, y - l * 0.15, h * 0.42).x},${project(x - w * 0.9, y - l * 0.15, h * 0.42).y}`}
          fill="#334155"
          stroke="rgba(255,255,255,0.1)"
        />
        <polygon
          points={`${tFR.x},${tFR.y} ${tBR.x},${tBR.y} ${project(x + w * 0.9, y + l * 0.72, h * 0.42).x},${project(x + w * 0.9, y + l * 0.72, h * 0.42).y} ${project(x + w * 0.9, y - l * 0.15, h * 0.42).x},${project(x + w * 0.9, y - l * 0.15, h * 0.42).y}`}
          fill="#334155"
          stroke="rgba(255,255,255,0.1)"
        />

        {/* Roof Top panel */}
        <polygon
          points={`${tFL.x},${tFL.y} ${tFR.x},${tFR.y} ${tBR.x},${tBR.y} ${tBL.x},${tBL.y}`}
          fill={lightColor}
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="0.5"
        />

        {/* Headlights glows */}
        <ellipse cx={project(x - w * 0.58, y - l * 0.98, h * 0.22).x} cy={project(x - w * 0.58, y - l * 0.98, h * 0.22).y} rx={3} ry={1.8} className="fill-amber-300 animate-pulse" />
        <ellipse cx={project(x + w * 0.58, y - l * 0.98, h * 0.22).x} cy={project(x + w * 0.58, y - l * 0.98, h * 0.22).y} rx={3} ry={1.8} className="fill-amber-300 animate-pulse" />

        {/* Rear brake taillights red */}
        <rect x={project(x - w * 0.75, y + l * 0.96, h * 0.22).x - 2} y={project(x - w * 0.75, y + l * 0.96, h * 0.22).y - 1} width={4} height={2} className="fill-red-500" />
        <rect x={project(x + w * 0.75, y + l * 0.96, h * 0.22).x - 2} y={project(x + w * 0.75, y + l * 0.96, h * 0.22).y - 1} width={4} height={2} className="fill-red-500" />
      </g>
    );
  };

  // --- ARCHITECTURAL CANOPY PILLARS RENDERER (Drawn in background layer) ---
  const renderAwningPillars = () => {
    // 4 Columns along the back boundary of slots
    const columnsX = [-4.4, -1.5, 1.5, 4.4];
    return columnsX.map((x, idx) => {
      const base = project(x, -2.15, 0);
      const top = project(x, -2.15, 2.3);
      return (
        <g key={`awning-col-${idx}`}>
          {/* Main vertical support column */}
          <line
            x1={base.x}
            y1={base.y}
            x2={top.x}
            y2={top.y}
            stroke="#1e293b"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          {/* Steel chrome inner structural shine */}
          <line
            x1={base.x}
            y1={base.y}
            x2={top.x}
            y2={top.y}
            stroke="#94a3b8"
            strokeWidth="1.0"
            strokeLinecap="round"
          />
          {/* Concrete collar footing base */}
          <ellipse
            cx={base.x}
            cy={base.y}
            rx="5.5"
            ry="2.8"
            className="fill-zinc-600 stroke-zinc-400"
            strokeWidth="0.5"
          />
        </g>
      );
    });
  };

  // --- DETAILED PEDESTRIAN WALKWAY (Lối đi bộ) ON LOBBY DECK (Left side empty floor) ---
  const renderPedestrianWalkway = () => {
    const stripesCount = 8;
    const walkwayXStart = -5.3;
    const walkwayXEnd = -4.5;
    const startY = -3.2;
    const endY = 1.0;
    const step = (endY - startY) / stripesCount;
    const lines = [];

    // Main green base band
    const pBL = project(walkwayXStart, startY, 0);
    const pBR = project(walkwayXEnd, startY, 0);
    const pFR = project(walkwayXEnd, endY, 0);
    const pFL = project(walkwayXStart, endY, 0);

    lines.push(
      <g key="pedestrian-band">
        <polygon
          points={`${pBL.x},${pBL.y} ${pBR.x},${pBR.y} ${pFR.x},${pFR.y} ${pFL.x},${pFL.y}`}
          fill="#0f766e"
          fillOpacity="0.18"
          stroke="#0f766e"
          strokeWidth="0.8"
          strokeDasharray="3 3"
        />
        {/* "WALKWAY" label text painted flat on floor */}
        <text
          x={project((walkwayXStart + walkwayXEnd)/2, (startY + endY)/2, 0).x}
          y={project((walkwayXStart + walkwayXEnd)/2, (startY + endY)/2, 0).y}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-22, ${project((walkwayXStart + walkwayXEnd)/2, (startY + endY)/2, 0).x}, ${project((walkwayXStart + walkwayXEnd)/2, (startY + endY)/2, 0).y})`}
          className="font-mono text-[7px] font-black fill-teal-800/40 uppercase tracking-widest"
        >
          WAY
        </text>
      </g>
    );

    for (let i = 0; i < stripesCount; i++) {
      const cy = startY + i * step + step / 2;
      const stripeW = 0.22;
      const pt1 = project(walkwayXStart, cy - stripeW, 0);
      const pt2 = project(walkwayXEnd, cy - stripeW, 0);
      const pt3 = project(walkwayXEnd, cy + stripeW, 0);
      const pt4 = project(walkwayXStart, cy + stripeW, 0);

      lines.push(
        <polygon
          key={`walk-stripe-${i}`}
          points={`${pt1.x},${pt1.y} ${pt2.x},${pt2.y} ${pt3.x},${pt3.y} ${pt4.x},${pt4.y}`}
          fill="#eab308"
          fillOpacity="0.75"
        />
      );
    }
    return lines;
  };

  // --- DIRECTORY KIOSK & SOLID SECURITY COLLAR BOLLARDS (Right side empty floor) ---
  const renderKioskAndBollards = () => {
    const kioskX = 4.8;
    const kioskY = -1.4;
    
    // Kiosk coordinates for 3D slab
    const w = 0.18;
    const l = 0.35;
    const h = 1.15;

    // Cuboid projection
    const bFL = project(kioskX - w, kioskY - l, 0);
    const bFR = project(kioskX + w, kioskY - l, 0);
    const bBR = project(kioskX + w, kioskY + l, 0);
    const bBL = project(kioskX - w, kioskY + l, 0);

    const tFL = project(kioskX - w, kioskY - l, h);
    const tFR = project(kioskX + w, kioskY - l, h);
    const tBR = project(kioskX + w, kioskY + l, h);
    const tBL = project(kioskX - w, kioskY + l, h);

    // Bollards at different corners of the parking deck for physical spacing look & feel
    const bollardsPos = [
      { x: -5.3, y: -3.4 },
      { x: -5.3, y: 1.2 },
      { x: 5.3, y: -3.4 },
      { x: 5.3, y: 1.2 },
      { x: 4.8, y: -0.5 }
    ];

    return (
      <g id="kiosk-and-safety-bollards">
        {/* Bollards */}
        {bollardsPos.map((pos, idx) => {
          const base = project(pos.x, pos.y, 0);
          const top = project(pos.x, pos.y, 0.45);
          return (
            <g key={`bollard-${idx}`}>
              {/* Pillar cylinder */}
              <line
                x1={base.x}
                y1={base.y}
                x2={top.x}
                y2={top.y}
                stroke="#1e293b"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <line
                x1={base.x}
                y1={base.y}
                x2={top.x}
                y2={top.y}
                stroke="#eab308"
                strokeWidth="1.2"
                strokeDasharray="2 3"
              />
              {/* Highlight top cap */}
              <circle cx={top.x} cy={top.y} r="1.4" className="fill-amber-400 stroke-zinc-950 stroke-[0.5]" />
            </g>
          );
        })}

        {/* 3D Smart directory kiosk slab */}
        {/* Ground shadow */}
        <ellipse cx={project(kioskX, kioskY, 0).x} cy={project(kioskX, kioskY, 0).y} rx="12" ry="6" fill="rgba(0,0,0,0.15)" />

        {/* Lower body front panel */}
        <polygon
          points={`${bFL.x},${bFL.y} ${bFR.x},${bFR.y} ${tFR.x},${tFR.y} ${tFL.x},${tFL.y}`}
          fill="#334155"
          stroke="#1e293b"
          strokeWidth="0.5"
        />
        {/* Lower body side panel */}
        <polygon
          points={`${bFR.x},${bFR.y} ${bBR.x},${bBR.y} ${tBR.x},${tBR.y} ${tFR.x},${tFR.y}`}
          fill="#1e293b"
          stroke="#0f172a"
          strokeWidth="0.5"
        />
        {/* Top panel */}
        <polygon
          points={`${tFL.x},${tFL.y} ${tFR.x},${tFR.y} ${tBR.x},${tBR.y} ${tBL.x},${tBL.y}`}
          fill="#475569"
        />

        {/* Glowing visual interface plate (glass panel style LCD screen) */}
        {(() => {
          const sFL = project(kioskX - w + 0.02, kioskY - l + 0.05, h * 0.4);
          const sFR = project(kioskX - w + 0.02, kioskY + l - 0.05, h * 0.4);
          const sTR = project(kioskX - w + 0.02, kioskY + l - 0.05, h * 0.95);
          const sTL = project(kioskX - w + 0.02, kioskY - l + 0.05, h * 0.95);
          
          return (
            <g>
              <polygon
                points={`${sFL.x},${sFL.y} ${sFR.x},${sFR.y} ${sTR.x},${sTR.y} ${sTL.x},${sTL.y}`}
                fill="#0f172a"
                stroke="#64748b"
                strokeWidth="0.5"
              />
              <polygon
                points={`${sFL.x},${sFL.y} ${sFR.x},${sFR.y} ${sTR.x},${sTR.y} ${sTL.x},${sTL.y}`}
                fill="url(#canopy-glass-blue)"
                fillOpacity="0.4"
              />
              {/* Tiny UI labels mimicking a directory map */}
              <text
                x={project(kioskX - w + 0.02, kioskY, h * 0.75).x}
                y={project(kioskX - w + 0.02, kioskY, h * 0.75).y}
                textAnchor="middle"
                className="font-mono text-[5px] font-black fill-sky-200 uppercase tracking-widest animate-pulse"
              >
                TWINPARK
              </text>
              <text
                x={project(kioskX - w + 0.02, kioskY, h * 0.55).x}
                y={project(kioskX - w + 0.02, kioskY, h * 0.55).y}
                textAnchor="middle"
                className="font-mono text-[4px] fill-emerald-350 font-bold uppercase tracking-wider"
              >
                ONLINE 100%
              </text>
            </g>
          );
        })()}
      </g>
    );
  };

  // --- EV SMART CHARGING PILES (Trạm Sạc) Behind each slot ---
  const renderChargingPiles = () => {
    return slotPositions.map((slotPos) => {
      const currentSlot = slots.find(s => s.id === slotPos.id);
      const isOccupied = currentSlot?.status === 'occupied';
      
      const px = slotPos.x;
      const py = slotPos.y - 1.25; // Centered behind bumper, just under raw background
      
      const pw = 0.12;
      const pl = 0.12;
      const ph = 0.72;

      // Cuboid points
      const bFL = project(px - pw, py - pl, 0);
      const bFR = project(px + pw, py - pl, 0);
      const bBR = project(px + pw, py + pl, 0);
      const bBL = project(px - pw, py + pl, 0);

      const tFL = project(px - pw, py - pl, ph);
      const tFR = project(px + pw, py - pl, ph);
      const tBR = project(px + pw, py + pl, ph);
      const tBL = project(px - pw, py + pl, ph);

      // Light color depending on status (Green/Available, Blue/Charging)
      const chargeColor = isOccupied ? '#38bdf8' : '#22c55e';
      const shadowBase = project(px, py, 0);

      return (
        <g key={`charger-pile-${slotPos.id}`} id={`charger-pile-${slotPos.id}`}>
          {/* Subtle ground shadow under the pile */}
          <ellipse cx={shadowBase.x} cy={shadowBase.y} rx="6" ry="3" fill="rgba(0,0,0,0.18)" />

          {/* Front Face */}
          <polygon
            points={`${bBL.x},${bBL.y} ${bBR.x},${bBR.y} ${tBR.x},${tBR.y} ${tBL.x},${tBL.y}`}
            fill="#334155"
            stroke="#1e293b"
            strokeWidth="0.5"
          />

          {/* Side Face - Right */}
          <polygon
            points={`${bBR.x},${bBR.y} ${bFL.x},${bFL.y} ${tFL.x},${tFL.y} ${tBR.x},${tBR.y}`}
            fill="#1e293b"
            stroke="#0f172a"
            strokeWidth="0.5"
          />

          {/* Top Cap */}
          <polygon
            points={`${tFL.x},${tFL.y} ${tFR.x},${tFR.y} ${tBR.x},${tBR.y} ${tBL.x},${tBL.y}`}
            fill="#475569"
            stroke="#1e293b"
            strokeWidth="0.4"
          />

          {/* Glowing Status LED Bar on front panel */}
          {(() => {
            const ledB = project(px - pw + 0.02, py + pl - 0.01, ph * 0.42);
            const ledT = project(px - pw + 0.02, py + pl - 0.01, ph * 0.88);
            
            return (
              <g>
                <line
                  x1={ledB.x}
                  y1={ledB.y}
                  x2={ledT.x}
                  y2={ledT.y}
                  stroke={chargeColor}
                  strokeWidth="2.0"
                  strokeLinecap="round"
                  className={isOccupied ? 'animate-pulse' : ''}
                />
                <circle cx={project(px - pw + 0.01, py + pl - 0.01, ph * 0.25).x} cy={project(px - pw + 0.01, py + pl - 0.01, ph * 0.25).y} r="1.3" className="fill-zinc-350" />
              </g>
            );
          })()}

          {/* Isometric Hanging EV Charger Cable Loop */}
          {(() => {
            const plugTop = project(px - pw - 0.05, py + pl * 0.6, ph * 0.45);
            const loopMid = project(px - pw - 0.08, py + pl, ph * 0.1);
            const anchorTop = project(px - pw, py + pl, ph * 0.55);

            return (
              <path
                d={`M ${anchorTop.x} ${anchorTop.y} Q ${loopMid.x} ${loopMid.y + 8} ${plugTop.x} ${plugTop.y}`}
                fill="none"
                stroke="#0f172a"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            );
          })()}
        </g>
      );
    });
  };

  // --- ARCHITECTURAL GLASS CANOPY ROOF RENDERER (Drawn above vehicles) ---
  const renderAwningRoof = () => {
    // Horizontal main girder truss coupling column tops
    const pLeft = project(-4.4, -2.15, 2.3);
    const pRight = project(4.4, -2.15, 2.3);

    // 5 Sloped steel rafters jutting out over the bays
    const raftersX = [-4.4, -2.2, 0, 2.2, 4.4];
    const rafterLines = raftersX.map((x, idx) => {
      const topBack = project(x, -2.15, 2.3);
      const topFront = project(x, -0.5, 1.95);
      
      // Diagonal geometric support bracket to hold the rafter
      const braceMid = project(x, -1.8, 1.5);
      const braceRafter = project(x, -1.25, 2.15);

      return (
        <g key={`rafter-${idx}`}>
          {/* Diagonal truss brace */}
          <line
            x1={braceMid.x}
            y1={braceMid.y}
            x2={braceRafter.x}
            y2={braceRafter.y}
            stroke="#475569"
            strokeWidth="2.0"
            strokeLinecap="round"
          />
          {/* Main forward-leaning rafter beam */}
          <line
            x1={topBack.x}
            y1={topBack.y}
            x2={topFront.x}
            y2={topFront.y}
            stroke="#1e293b"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* Top chrome trim edge cap */}
          <line
            x1={topBack.x}
            y1={topBack.y}
            x2={topFront.x}
            y2={topFront.y}
            stroke="#cbd5e1"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          {/* End-node cap */}
          <circle
            cx={topFront.x}
            cy={topFront.y}
            r="2.2"
            className="fill-[#e2e8f0] stroke-[#1e293b]"
            strokeWidth="0.6"
          />
        </g>
      );
    });

    // 4 Interlocking, translucent, high-tech glass roof bays
    const glassSheets = [];
    for (let i = 0; i < raftersX.length - 1; i++) {
      const x1 = raftersX[i];
      const x2 = raftersX[i+1];

      const pBackLeft = project(x1, -2.15, 2.3);
      const pBackRight = project(x2, -2.15, 2.3);
      const pFrontRight = project(x2, -0.5, 1.95);
      const pFrontLeft = project(x1, -0.5, 1.95);

      // Center segment divider line for multiple pane elegance
      const midX = (x1 + x2) / 2;
      const pBackMid = project(midX, -2.15, 2.3);
      const pFrontMid = project(midX, -0.5, 1.95);

      glassSheets.push(
        <g key={`canopy-pane-${i}`} className="pointer-events-none">
          {/* Glass pane left */}
          <polygon
            points={`${pBackLeft.x},${pBackLeft.y} ${pBackMid.x},${pBackMid.y} ${pFrontMid.x},${pFrontMid.y} ${pFrontLeft.x},${pFrontLeft.y}`}
            fill="url(#canopy-glass-blue)"
            fillOpacity="0.22"
            stroke="#0284c7"
            strokeWidth="0.6"
            strokeOpacity="0.35"
          />
          {/* Glass pane right */}
          <polygon
            points={`${pBackMid.x},${pBackMid.y} ${pBackRight.x},${pBackRight.y} ${pFrontRight.x},${pFrontRight.y} ${pFrontMid.x},${pFrontMid.y}`}
            fill="url(#canopy-glass-teal)"
            fillOpacity="0.22"
            stroke="#0d9488"
            strokeWidth="0.6"
            strokeOpacity="0.35"
          />
          {/* Polished light reflection flare line */}
          <line
            x1={pBackLeft.x + (pBackRight.x - pBackLeft.x) * 0.2}
            y1={pBackLeft.y + (pBackRight.y - pBackLeft.y) * 0.2}
            x2={pFrontLeft.x + (pFrontRight.x - pFrontLeft.x) * 0.35}
            y2={pFrontLeft.y + (pFrontRight.y - pFrontLeft.y) * 0.35}
            stroke="#ffffff"
            strokeWidth="0.75"
            strokeLinecap="round"
            strokeOpacity="0.25"
          />
        </g>
      );
    }

    // Mini warm/green smart spotlights casting ambient illumination towards parking spaces
    const spotlightBeams = slotPositions.map((slotPos) => {
      const topPos = project(slotPos.x, -1.3, 1.95); // Height under the glass roof
      const fpLeft = project(slotPos.x - 0.42, -1.3, 0); // footprint boundary lines
      const fpRight = project(slotPos.x + 0.42, -1.3, 0);
      
      const currentSlot = slots.find(s => s.id === slotPos.id);
      const isOccupied = currentSlot?.status === 'occupied';
      const beamColor = isOccupied ? 'url(#spot-glow-amber)' : 'url(#spot-glow-teal)';

      return (
        <g key={`light-volumetric-${slotPos.id}`} className="pointer-events-none">
          {/* Soft light cone casting down */}
          <polygon
            points={`${topPos.x},${topPos.y} ${fpRight.x},${fpRight.y} ${fpLeft.x},${fpLeft.y}`}
            fill={beamColor}
            opacity="0.14"
          />
          {/* Glowing LED emitter on the rafter underside */}
          <circle
            cx={topPos.x}
            cy={topPos.y}
            r="1.8"
            className="fill-yellow-300 stroke-amber-500 animate-pulse"
            strokeWidth="0.4"
          />
        </g>
      );
    });

    return (
      <g id="awning-roof-structure">
        {/* Support truss bar */}
        <line
          x1={pLeft.x}
          y1={pLeft.y}
          x2={pRight.x}
          y2={pRight.y}
          stroke="#1e293b"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <line
          x1={pLeft.x}
          y1={pLeft.y}
          x2={pRight.x}
          y2={pRight.y}
          stroke="#475569"
          strokeWidth="1.0"
          strokeLinecap="round"
        />

        {/* Ambient spotlight rays */}
        {spotlightBeams}

        {/* Translucent glass sheet sections */}
        {glassSheets}

        {/* Solid rafter trusses */}
        {rafterLines}
      </g>
    );
  };

  // --- SMART STREETLIGHT DECORATIONS (Drawn bordering entries) ---
  const renderStreetLights = () => {
    const poles = [
      { x: -5.1, y: 4.1, armX: -4.3, armY: 3.5 },
      { x: 5.1, y: 4.1, armX: 4.3, armY: 3.5 }
    ];

    return poles.map((p, idx) => {
      const base = project(p.x, p.y, 0);
      const top = project(p.x, p.y, 2.3);
      const tip = project(p.armX, p.armY, 2.12);

      return (
        <g key={`street-light-${idx}`}>
          {/* Footing flange */}
          <ellipse cx={base.x} cy={base.y} rx="4.5" ry="2.2" className="fill-zinc-700 stroke-zinc-500" strokeWidth="0.5" />
          
          {/* Light shaft */}
          <line x1={base.x} y1={base.y} x2={top.x} y2={top.y} stroke="#1e293b" strokeWidth="2.8" strokeLinecap="round" />
          <line x1={base.x} y1={base.y} x2={top.x} y2={top.y} stroke="#94a3b8" strokeWidth="0.8" strokeLinecap="round" />

          {/* Curved bent neck */}
          <path
            d={`M ${top.x} ${top.y} Q ${(top.x + tip.x)/2} ${top.y - 12} ${tip.x} ${tip.y}`}
            fill="none"
            stroke="#334155"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* Lamp housing fixture */}
          <circle cx={tip.x} cy={tip.y} r="2.6" className="fill-zinc-800" />
          {/* Streetlight light spread overlay */}
          <polygon
            points={`${tip.x},${tip.y} ${project(p.armX - 0.75, p.armY, 0).x},${project(p.armX - 0.75, p.armY, 0).y} ${project(p.armX + 0.75, p.armY, 0).x},${project(p.armX + 0.75, p.armY, 0).y}`}
            fill="url(#spot-glow-amber)"
            opacity="0.08"
            className="pointer-events-none"
          />
          {/* Emitter jewel */}
          <circle cx={tip.x} cy={tip.y} r="1.3" className="fill-amber-300 animate-pulse" />
        </g>
      );
    });
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-[530px] lg:h-[560px] bg-white rounded-2xl border border-zinc-200/60 overflow-hidden flex flex-col justify-between p-4 md:p-6 matte-shadow select-none"
    >
      {/* Visual background style identifier layout */}
      <div className="absolute top-6 left-6 z-10 flex flex-col pointer-events-none">
        <h3 className="font-display text-xs tracking-[0.2em] text-zinc-950 font-extrabold flex items-center gap-2 uppercase">
          MÔ HÌNH VẬN HÀNH 3D
        </h3>
        <p className="font-mono text-[9px] text-zinc-500 tracking-wider mt-1.5 uppercase font-bold">
          Xoay ngang: {Math.round(yaw)}° | Nghiêng: {Math.round(pitch)}° <span className="text-[#0d9488] ml-2 font-extrabold">• KÉO CHUỘT / KHUẤY VUỐT ĐỂ XOAY • CHUYỂN ĐỘNG SIÊU MƯỢT</span>
        </p>
      </div>

      {/* Operator controls overlay HUD */}
      <div className="absolute top-6 right-6 z-10 flex flex-wrap items-center gap-1.5 bg-white/95 border border-zinc-200/80 p-1.5 rounded-xl shadow-sm backdrop-blur-md max-w-[280px] sm:max-w-none">
        
        {/* Toggle Button for Auto Rotate */}
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`px-2.5 py-1 text-[8.5px] font-mono font-bold tracking-wider rounded transition-all duration-300 cursor-pointer ${
            autoRotate 
              ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/25 font-black' 
              : 'text-zinc-650 hover:text-zinc-950 bg-zinc-50 border border-zinc-200'
          }`}
          title="Tự động xoay mô hình 3D"
          id="btn-auto-rotate"
        >
          {autoRotate ? '▲ AUTO-ROTATING (LIVE)' : '▶ XOAY TỰ ĐỘNG'}
        </button>

        <div className="h-4 w-[1px] bg-zinc-200" />

        <button
          onClick={() => { setYaw(315); setPitch(45); setAutoRotate(false); }}
          className="px-2 py-1 text-[8.5px] font-mono font-bold tracking-wider text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded transition cursor-pointer"
          title="Đặt lại camera"
          id="btn-reset-cam"
        >
          ĐẶT LẠI KHUNG HÌNH (RESET)
        </button>

        <div className="hidden sm:block h-4 w-[1px] bg-zinc-200" />

        <button
          onClick={() => setZoom((prev) => Math.min(prev + 0.15, 2.0))}
          className="px-2.5 py-1 text-[8.5px] font-mono font-bold text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded transition cursor-pointer"
          id="btn-zoom-up-hd"
        >
          + PHÓNG
        </button>
        <button
          onClick={() => setZoom((prev) => Math.max(prev - 0.15, 0.5))}
          className="px-2.5 py-1 text-[8.5px] font-mono font-bold text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded transition cursor-pointer"
          id="btn-zoom-down-hd"
        >
          - THU
        </button>


      </div>

      {/* SVG Canvas stage with perspective projection wrapper and drag gestures */}
      <div className="flex-1 w-full h-full flex items-center justify-center pt-2 pb-1 relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className={`w-full h-full select-none cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ touchAction: 'none' }}
        >
          <defs>
            <linearGradient id="scan-gate1-laser-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="scan-gate2-laser-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#be123c" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#be123c" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="glowing-led-green" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#15803d" />
            </radialGradient>
            
            {/* Canopy Glass Material Colors */}
            <linearGradient id="canopy-glass-blue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#e0f2fe" />
            </linearGradient>
            <linearGradient id="canopy-glass-teal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="50%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#f0fdfa" />
            </linearGradient>

            {/* Light Cone Conical Volumetric Glow Gradients */}
            <linearGradient id="spot-glow-teal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="1" />
              <stop offset="25%" stopColor="#0d9488" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="spot-glow-amber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#facc15" stopOpacity="1" />
              <stop offset="25%" stopColor="#d97706" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 3D Foundation Concrete Slab with clean light bevels */}
          <polygon points={slab.left} fill="#cfcbc2" stroke="#b4b0a5" strokeWidth="0.5" />
          <polygon points={slab.right} fill="#dedad1" stroke="#c0bcae" strokeWidth="0.5" />
          <polygon points={slab.front} fill="#cbc7be" stroke="#aaa69a" strokeWidth="0.5" />
          <polygon points={slab.top} fill="#eceae3" stroke="#dad7cb" strokeWidth="0.5" />

          {/* Real Black Asphalt Roadway drive track - only where cars enter and exit in the front */}
          <polygon
            points={`${project(-5.6, 1.4, 0).x},${project(-5.6, 1.4, 0).y} ${project(5.6, 1.4, 0).x},${project(5.6, 1.4, 0).y} ${project(5.6, 4.8, 0).x},${project(5.6, 4.8, 0).y} ${project(-5.6, 4.8, 0).x},${project(-5.6, 4.8, 0).y}`}
            fill="#22252c"
            stroke="#1b1c21"
            strokeWidth="0.5"
          />

          {/* Render Ground custom gridlines for structural feel */}
          {renderGridLines()}

          {/* Decorative Planter Hedges around back of parking space */}
          {renderPlanterDecoration()}

          {/* Core Steel Awning Columns (Pillars) in the background */}
          {renderAwningPillars()}

          {/* Detailed Pedestrian path on the empty left side */}
          {renderPedestrianWalkway()}

          {/* Smart EV Charging post towers behind each slot */}
          {renderChargingPiles()}

          {/* Smart information Kiosk & Bollards on the empty right side */}
          {renderKioskAndBollards()}

          {/* HIGH-CONTRAST ASPHALT ROADWAY GRAPHICS & LINES (Exactly like the real photo) */}
          <g id="roadway-paint">
            {/* White solid back edge boundary line */}
            <line
              x1={project(-5.6, 1.45, 0).x}
              y1={project(-5.6, 1.45, 0).y}
              x2={project(5.6, 1.45, 0).x}
              y2={project(5.6, 1.45, 0).y}
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="2.5"
            />

            {/* White solid front edge boundary line */}
            <line
              x1={project(-5.6, 4.75, 0).x}
              y1={project(-5.6, 4.75, 0).y}
              x2={project(5.6, 4.75, 0).x}
              y2={project(5.6, 4.75, 0).y}
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth="3.2"
            />

            {/* Middle lane white dividing stripes */}
            <line
              x1={project(-5.6, 3.1, 0).x}
              y1={project(-5.6, 3.1, 0).y}
              x2={project(5.6, 3.1, 0).x}
              y2={project(5.6, 3.1, 0).y}
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeDasharray="18 14"
            />

            {/* DOUBLE SOLID YELLOW CENTER DIVIDER (Separates entry/left & exit/right flows along the Y axis at X = 0) */}
            <line
              x1={project(-0.06, 1.45, 0).x}
              y1={project(-0.06, 1.45, 0).y}
              x2={project(-0.06, 4.75, 0).x}
              y2={project(-0.06, 4.75, 0).y}
              stroke="#eab308"
              strokeWidth="2.5"
            />
            <line
              x1={project(0.06, 1.45, 0).x}
              y1={project(0.06, 1.45, 0).y}
              x2={project(0.06, 4.75, 0).x}
              y2={project(0.06, 4.75, 0).y}
              stroke="#eab308"
              strokeWidth="2.5"
            />
          </g>

          {/* Lane dividers arrows */}
          <line
            x1={project(-4.8, 1.1, 0).x}
            y1={project(-4.8, 1.1, 0).y}
            x2={project(4.8, 1.1, 0).x}
            y2={project(4.8, 1.1, 0).y}
            className="stroke-white/30"
            strokeWidth="1.2"
            strokeDasharray="4 8"
          />

          {/* DIRECTIONAL MARKINGS ON GROUND */}
          <g id="ground-arrows">
            {/* IN Arrow */}
            <path
              d={`M ${project(-3.8, 3.4, 0).x} ${project(-3.8, 3.4, 0).y} L ${project(-3.8, 2.7, 0).x} ${project(-3.8, 2.7, 0).y}
                  M ${project(-3.8, 2.7, 0).x} ${project(-3.8, 2.7, 0).y} L ${project(-3.95, 2.9, 0).x} ${project(-3.95, 2.9, 0).y}
                  M ${project(-3.8, 2.7, 0).x} ${project(-3.8, 2.7, 0).y} L ${project(-3.65, 2.9, 0).x} ${project(-3.65, 2.9, 0).y}`}
              className="fill-none stroke-amber-400 stroke-[2] drop-shadow-sm"
            />
            {/* OUT Arrow */}
            <path
              d={`M ${project(3.8, 2.7, 0).x} ${project(3.8, 2.7, 0).y} L ${project(3.8, 3.4, 0).x} ${project(3.8, 3.4, 0).y}
                  M ${project(3.8, 3.4, 0).x} ${project(3.8, 3.4, 0).y} L ${project(3.62, 3.15, 0).x} ${project(3.62, 3.15, 0).y}
                  M ${project(3.8, 3.4, 0).x} ${project(3.8, 3.4, 0).y} L ${project(3.98, 3.15, 0).x} ${project(3.98, 3.15, 0).y}`}
              className="fill-none stroke-amber-400 stroke-[2] drop-shadow-sm"
            />
          </g>

          {/* --- CỔNG VÀO (IN GATE 1) --- */}
          {(() => {
            const gX = -3.8;
            const gY = 3.6;
            const gateX = -4.3; // Placed at the roadside edge
            const gateY = 3.6;
            const gate = gates.find((g) => g.id === 'entrance')!;
            // Lift barrier when entering vehicle has progressed between 0% and 45%
            const isCarPassing = animatingCars.some((c) => c.type === 'entering' && c.progress <= 0.45);
            const isOpen = gate.status === 'open' || gate.status === 'opening' || isCarPassing;

            const base = project(gateX, gateY, 0);
            const top = project(gateX, gateY, 0.85); // slightly taller

            // Calculate 3D projected coordinates for the arm so it rotates parallel to the model floor
            const rEnt = (entranceArmAngle * Math.PI) / 180;
            const armLength = 1.5;
            const tipIn = project(gateX + armLength * Math.cos(rEnt), gateY, 0.85 + armLength * Math.sin(rEnt));
            const tipInYellow = project(gateX + armLength * 0.80 * Math.cos(rEnt), gateY, 0.85 + armLength * 0.80 * Math.sin(rEnt));

            return (
              <g id="gate-in-3d">
                {/* 3D safety orange barrier cabinet */}
                <polygon
                  points={`${base.x - 6.5},${base.y} ${base.x + 6.5},${base.y} ${top.x + 6.5},${top.y} ${top.x - 6.5},${top.y}`}
                  className="fill-orange-500 stroke-orange-700"
                  strokeWidth="0.8"
                />
                <polygon
                  points={`${base.x},${base.y} ${base.x + 6.5},${base.y} ${top.x + 6.5},${top.y} ${top.x},${top.y}`}
                  className="fill-orange-600/50"
                />
                {/* Dark cabinet metal cap */}
                <polygon
                  points={`${top.x - 6.5},${top.y} ${top.x + 6.5},${top.y} ${top.x + 5.5},${top.y - 3.5} ${top.x - 5.5},${top.y - 3.5}`}
                  className="fill-zinc-800 stroke-zinc-950"
                  strokeWidth="0.5"
                />

                {/* Laser scanner emitter dot */}
                <circle cx={top.x - 2} cy={top.y + 12} r={1.8} className="fill-zinc-950" />
                <line x1={top.x - 2} y1={top.y + 12} x2={top.x - 2} y2={top.y + 20} className="stroke-teal-500" strokeWidth="1.5" />

                {/* Status LED Dome */}
                <circle
                  cx={top.x}
                  cy={top.y - 2}
                  r={3.5}
                  className={isOpen ? 'fill-emerald-400 animate-pulse' : 'fill-rose-500 animate-pulse'}
                  stroke={isOpen ? '#059669' : '#be123c'}
                  strokeWidth="0.8"
                />

                {(gate.status === 'scanner_active' || isCarPassing) && (
                  <polygon
                    points={`${top.x},${top.y} ${project(gX - 1.2, gY + 1.2, 0).x},${project(gX - 1.2, gY + 1.2, 0).y} ${project(gX + 1.2, gY + 1.2, 0).x},${project(gX + 1.2, gY + 1.2, 0).y}`}
                    fill="url(#scan-gate1-laser-glow)"
                  />
                )}

                {/* 3D Fixed Projected Barrier Gate Arm */}
                {/* Shadow / dark background outline */}
                <line
                  x1={top.x}
                  y1={top.y}
                  x2={tipIn.x}
                  y2={tipIn.y}
                  stroke="#1e293b"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                {/* White base */}
                <line
                  x1={top.x}
                  y1={top.y}
                  x2={tipIn.x}
                  y2={tipIn.y}
                  stroke="#ffffff"
                  strokeWidth="8.5"
                  strokeLinecap="round"
                />
                {/* Red stripes */}
                <line
                  x1={top.x}
                  y1={top.y}
                  x2={tipIn.x}
                  y2={tipIn.y}
                  stroke="#ef4444"
                  strokeWidth="8.5"
                  strokeDasharray="14 10"
                  strokeLinecap="round"
                />
                {/* Yellow warning tape tip */}
                <line
                  x1={tipInYellow.x}
                  y1={tipInYellow.y}
                  x2={tipIn.x}
                  y2={tipIn.y}
                  stroke="#facc15"
                  strokeWidth="8.5"
                  strokeLinecap="round"
                />
                
                {/* Joint pivot hub and chrome screw cap */}
                <circle cx={top.x} cy={top.y} r={7.5} className="fill-zinc-800" />
                <circle cx={top.x} cy={top.y} r={3.2} className="fill-zinc-300" />
                <circle cx={top.x} cy={top.y} r={1.2} className="fill-zinc-550" />

                <g transform={`translate(${project(gX, gY, 1.35).x}, ${project(gX, gY, 1.35).y})`}>
                  <rect x="-35" y="-10" width="70" height="11" rx="2" className="fill-white/95 stroke-zinc-200 shadow-sm" strokeWidth="0.5" />
                  <text x="0" y="-2" textAnchor="middle" className="font-mono text-[6.5px] font-extrabold fill-zinc-700 tracking-wider">
                    LỐI VÀO: {isOpen ? 'ĐANG MỞ' : 'CHỜ XE'}
                  </text>
                </g>
              </g>
            );
          })()}

          {/* --- CỔNG RA (OUT GATE 2) --- */}
          {(() => {
            const gX = 3.8;
            const gY = 3.6;
            const gateX = 4.3; // Placed at the roadside edge
            const gateY = 3.6;
            const gate = gates.find((g) => g.id === 'exit')!;
            // Lift barrier when exiting vehicle has progressed beyond 55%
            const isCarPassing = animatingCars.some((c) => c.type === 'exiting' && c.progress >= 0.55);
            const isOpen = gate.status === 'open' || gate.status === 'opening' || isCarPassing;

            const base = project(gateX, gateY, 0);
            const top = project(gateX, gateY, 0.85); // slightly taller

            // Calculate 3D projected coordinates for the exit arm so it rotates parallel to the model floor (points leftward)
            const rExit = (exitArmAngle * Math.PI) / 180;
            const armLength = 1.5;
            const tipOut = project(gateX - armLength * Math.cos(rExit), gateY, 0.85 + armLength * Math.sin(rExit));
            const tipOutYellow = project(gateX - armLength * 0.80 * Math.cos(rExit), gateY, 0.85 + armLength * 0.80 * Math.sin(rExit));

            return (
              <g id="gate-out-3d">
                {/* 3D safety orange barrier cabinet */}
                <polygon
                  points={`${base.x - 6.5},${base.y} ${base.x + 6.5},${base.y} ${top.x + 6.5},${top.y} ${top.x - 6.5},${top.y}`}
                  className="fill-orange-500 stroke-orange-700"
                  strokeWidth="0.8"
                />
                <polygon
                  points={`${base.x},${base.y} ${base.x + 6.5},${base.y} ${top.x + 6.5},${top.y} ${top.x},${top.y}`}
                  className="fill-orange-600/50"
                />
                {/* Dark cabinet metal cap */}
                <polygon
                  points={`${top.x - 6.5},${top.y} ${top.x + 6.5},${top.y} ${top.x + 5.5},${top.y - 3.5} ${top.x - 5.5},${top.y - 3.5}`}
                  className="fill-zinc-800 stroke-zinc-950"
                  strokeWidth="0.5"
                />

                {/* Status LED Dome */}
                <circle
                  cx={top.x}
                  cy={top.y - 2}
                  r={3.5}
                  className={isOpen ? 'fill-emerald-400 animate-pulse' : 'fill-rose-500 animate-pulse'}
                  stroke={isOpen ? '#059669' : '#be123c'}
                  strokeWidth="0.8"
                />

                {(gate.status === 'scanner_active' || isCarPassing) && (
                  <polygon
                    points={`${top.x},${top.y} ${project(gX - 1.2, gY + 1.2, 0).x},${project(gX - 1.2, gY + 1.2, 0).y} ${project(gX + 1.2, gY + 1.2, 0).x},${project(gX + 1.2, gY + 1.2, 0).y}`}
                    fill="url(#scan-gate2-laser-glow)"
                  />
                )}

                {/* 3D Fixed Projected Barrier Gate Arm */}
                {/* Shadow / dark background outline */}
                <line
                  x1={top.x}
                  y1={top.y}
                  x2={tipOut.x}
                  y2={tipOut.y}
                  stroke="#1e293b"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                {/* White base */}
                <line
                  x1={top.x}
                  y1={top.y}
                  x2={tipOut.x}
                  y2={tipOut.y}
                  stroke="#ffffff"
                  strokeWidth="8.5"
                  strokeLinecap="round"
                />
                {/* Red stripes */}
                <line
                  x1={top.x}
                  y1={top.y}
                  x2={tipOut.x}
                  y2={tipOut.y}
                  stroke="#ef4444"
                  strokeWidth="8.5"
                  strokeDasharray="14 10"
                  strokeLinecap="round"
                />
                {/* Yellow warning tape tip */}
                <line
                  x1={tipOutYellow.x}
                  y1={tipOutYellow.y}
                  x2={tipOut.x}
                  y2={tipOut.y}
                  stroke="#facc15"
                  strokeWidth="8.5"
                  strokeLinecap="round"
                />
                
                {/* Joint pivot hub and chrome screw cap */}
                <circle cx={top.x} cy={top.y} r={7.5} className="fill-zinc-800" />
                <circle cx={top.x} cy={top.y} r={3.2} className="fill-zinc-300" />
                <circle cx={top.x} cy={top.y} r={1.2} className="fill-zinc-550" />

                <g transform={`translate(${project(gX, gY, 1.35).x}, ${project(gX, gY, 1.35).y})`}>
                  <rect x="-35" y="-10" width="70" height="11" rx="2" className="fill-white/95 stroke-zinc-200 shadow-sm" strokeWidth="0.5" />
                  <text x="0" y="-2" textAnchor="middle" className="font-mono text-[6.5px] font-extrabold fill-zinc-700 tracking-wider">
                    LỐI RA: {isOpen ? 'ĐANG MỞ' : 'CHỜ KÍCH'}
                  </text>
                </g>
              </g>
            );
          })()}

          {/* --- RENDERING THE 6 SLOTS & GENERAL VEHICLES --- */}
          {slotPositions.map((slotPos) => {
            const currentSlot = slots.find((s) => s.id === slotPos.id);
            if (!currentSlot) return null;

            const isSelected = selectedSlotId === currentSlot.id;
            const isEmpty = currentSlot.status === 'empty';

            const w = 0.62; 
            const l = 1.05;

            // Slot bounding points
            const p1 = project(slotPos.x - w, slotPos.y - l, 0);
            const p2 = project(slotPos.x + w, slotPos.y - l, 0);
            const p3 = project(slotPos.x + w, slotPos.y + l, 0);
            const p4 = project(slotPos.x - w, slotPos.y + l, 0);

            const sensorTop = project(slotPos.x, slotPos.y - 0.45, 1.35);
            const sensorBase = project(slotPos.x, slotPos.y - 0.45, 0);

            return (
              <g
                key={`slot-${currentSlot.id}`}
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSlot(currentSlot.id);
                }}
                id={`slot-panel-${currentSlot.id}`}
              >
                {/* Highlight ring if selected */}
                {isSelected && (
                  <polygon
                    points={`${p1.x - 3.5},${p1.y - 3.5} ${p2.x + 3.5},${p2.y - 3.5} ${p3.x + 3.5},${p3.y + 3.5} ${p4.x - 3.5},${p4.y + 3.5}`}
                    className="fill-none stroke-teal-500 stroke-[1.5]"
                  />
                )}

                {/* Ground painted boundary boxes with bright corners */}
                <polygon
                  points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                  className={`transition-all duration-300 ${
                    isSelected
                      ? 'fill-teal-500/10 stroke-teal-500 stroke-[2]'
                      : 'fill-zinc-300/10 stroke-zinc-400 group-hover:stroke-zinc-600'
                  }`}
                  strokeWidth="1.2"
                />

                {/* Painted letter "P" in the center of each parking bay */}
                <text
                  x={project(slotPos.x, slotPos.y, 0).x}
                  y={project(slotPos.x, slotPos.y, 0).y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={`font-display text-[15px] font-black tracking-widest transition-colors duration-250 select-none pointer-events-none ${
                    isSelected ? 'fill-teal-600/35' : 'fill-zinc-400/45'
                  }`}
                >
                  P
                </text>

                {/* Bumper stop curbs at rear of parking slots */}
                <g id={`bumper-${currentSlot.id}`}>
                  {(() => {
                    const bx1 = slotPos.x - 0.42;
                    const bx2 = slotPos.x + 0.42;
                    const by = slotPos.y - 0.85;
                    
                    const bmL = project(bx1, by, 0);
                    const bmR = project(bx2, by, 0);
                    const bmLH = project(bx1, by, 0.08);
                    const bmRH = project(bx2, by, 0.08);

                    return (
                      <g>
                        <line x1={bmL.x} y1={bmL.y} x2={bmR.x} y2={bmR.y} className="stroke-zinc-800" strokeWidth="2.5" />
                        <line x1={bmLH.x} y1={bmLH.y} x2={bmRH.x} y2={bmRH.y} className="stroke-amber-450" strokeWidth="1.2" strokeDasharray="3 3" />
                      </g>
                    );
                  })()}
                </g>

                {/* Painted label indicator text on floor (e.g. A-01, A-02) */}
                <text
                  x={project(slotPos.x, slotPos.y + 0.78, 0).x}
                  y={project(slotPos.x, slotPos.y + 0.78, 0).y}
                  textAnchor="middle"
                  className={`font-mono text-[9.5px] font-bold tracking-wider transition-colors duration-200 ${
                    isSelected ? 'fill-teal-700 font-extrabold' : 'fill-zinc-500 group-hover:fill-zinc-850'
                  }`}
                >
                  {currentSlot.label}
                </text>

                {/* Gasoline Vehicle Render - hide if we are in entering animation phase to keep motion fluid */}
                {!isEmpty && currentSlot.car && !animatingCars.some(c => c.slotId === currentSlot.id && c.type === 'entering') && (
                  <g>
                    {renderCar(
                      slotPos.x,
                      slotPos.y,
                      currentSlot.car.color
                    )}
                  </g>
                )}

                {/* Sensor support pin line */}
                <line
                  x1={sensorBase.x}
                  y1={sensorBase.y}
                  x2={sensorTop.x}
                  y2={sensorTop.y}
                  className="stroke-zinc-400"
                  strokeWidth="0.6"
                />
                
                {/* Physical sensor head */}
                <circle cx={sensorTop.x} cy={sensorTop.y} r={3} className="fill-zinc-50 stroke-zinc-300" strokeWidth="0.75" />
                <circle
                  cx={sensorTop.x}
                  cy={sensorTop.y}
                  r="1.3"
                  className={isEmpty ? 'fill-emerald-600 animate-pulse' : 'fill-rose-600'}
                />

                {/* Ray laser casting */}
                {showLasers && (
                  <line
                    x1={sensorTop.x}
                    y1={sensorTop.y}
                    x2={project(slotPos.x, slotPos.y - 0.45, isEmpty ? 0 : 0.45).x}
                    y2={project(slotPos.x, slotPos.y - 0.45, isEmpty ? 0 : 0.45).y}
                    className={`stroke-[0.75] ${isEmpty ? 'stroke-emerald-600/15' : 'stroke-rose-600/20'}`}
                    strokeDasharray="2 6"
                  />
                )}

                 {/* Upper Floating Badge/Tag (Slot Label) - Only shown if parked */}
                {!isEmpty && (
                  <g transform={`translate(${project(slotPos.x, slotPos.y, 1.8).x}, ${project(slotPos.x, slotPos.y, 1.8).y})`}>
                    <rect
                      x="-20"
                      y="-9"
                      width="40"
                      height="11"
                      rx="1.5"
                      className={`fill-white/95 stroke-[1] ${isSelected ? 'stroke-zinc-950 font-bold shadow' : 'stroke-zinc-200'}`}
                    />
                    <text x="0" y="-1.5" textAnchor="middle" className="font-mono text-[6.5px] font-bold fill-zinc-900 font-extrabold">
                      {currentSlot.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* --- RENDERING THE MOVING/TRANSITIONING VEHICLES FROM ESP32-S3 TRAFFIC --- */}
          {animatingCars.map((car) => {
            const currentX = car.startX + (car.endX - car.startX) * car.progress;
            const currentY = car.startY + (car.endY - car.startY) * car.progress;
            return (
              <g key={car.id}>
                {renderCar(currentX, currentY, car.color)}
              </g>
            );
          })}

          {/* High-fidelity futuristic glass-awning structure (does not block slots view) */}
          {renderAwningRoof()}

          {/* Smart pathway street lamps */}
          {renderStreetLights()}
        </svg>
      </div>

      {/* Grid Legend information bar below */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#faf9f6] px-4 py-3 rounded-xl border border-zinc-200 gap-3">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600 font-bold">Ô đỗ còn trống</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600 font-bold">Đã được đỗ</span>
          </div>
        </div>

        <div className="text-right flex items-center gap-1.5 text-zinc-500 select-none">
          <p className="font-mono text-[8.5px] uppercase tracking-wider font-extrabold">
            BẢN ĐỒ GIAO DIỆN KHÁCH
          </p>
        </div>
      </div>
    </div>
  );
}
