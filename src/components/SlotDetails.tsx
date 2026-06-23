import React, { useState, useEffect } from 'react';
import { ParkingSlot } from '../types';
import { Car } from 'lucide-react';

interface SlotDetailsProps {
  slots: ParkingSlot[];
  slot: ParkingSlot | null;
  onToggleEVCharging: (slotId: number) => void;
  onReleaseSlot: (slotId: number) => void;
  onSelectSlot?: (slotId: number) => void;
  isAdmin?: boolean;
}

export default function SlotDetails({
  slots = [],
  slot,
  onReleaseSlot,
  onSelectSlot,
  isAdmin = false,
}: SlotDetailsProps) {
  const [jitterDistance, setJitterDistance] = useState<number>(0);
  const [jitterTemp, setJitterTemp] = useState<number>(0);

  useEffect(() => {
    if (!slot) return;
    const interval = setInterval(() => {
      setJitterDistance((Math.random() - 0.5) * 1.2);
      setJitterTemp((Math.random() - 0.5) * 0.15);
    }, 1200);

    return () => clearInterval(interval);
  }, [slot]);

  const renderSixSlotsGrid = () => {
    return (
      <div className="mt-5 pt-5 border-t border-zinc-100">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
            SƠ ĐỒ TRẠNG THÁI (06 Ô)
          </span>
          <span className="text-[8px] font-mono text-zinc-400">CHỌN Ô ĐỂ XEM</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {slots.map((s) => {
            const isSSelected = slot?.id === s.id;
            const isSEmpty = s.status === 'empty';
            return (
              <button
                key={`grid-slot-${s.id}`}
                onClick={() => onSelectSlot && onSelectSlot(s.id)}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${
                  isSSelected 
                    ? 'border-teal-500 bg-teal-500/5 ring-1 ring-teal-400/30' 
                    : 'border-zinc-200 bg-zinc-50/40 hover:bg-zinc-100/70 hover:border-zinc-300'
                }`}
              >
                <span className={`text-[11px] font-mono font-bold ${isSSelected ? 'text-teal-700' : 'text-zinc-700'}`}>
                  {s.label}
                </span>
                <span className={`text-[8px] font-bold mt-1 px-1.5 py-0.5 rounded-md ${
                  isSEmpty 
                    ? 'bg-emerald-50 text-emerald-650' 
                    : 'bg-rose-50 text-rose-600'
                }`}>
                  {isSEmpty ? 'TRỐNG' : 'CÓ XE'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!slot) {
    return (
      <div className="w-full bg-white border border-zinc-200/60 rounded-2xl p-6 flex flex-col justify-between h-full min-h-[380px] matte-shadow text-left">
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-400 animate-ping mb-4" />
          <p className="font-display font-medium text-zinc-900 text-xs tracking-[0.2em] uppercase">
            CHẨN ĐOÁN CẢM BIẾN MODBUS
          </p>
          <p className="text-xs text-zinc-500 mt-3 max-w-[240px] leading-relaxed">
            Bấm chọn ô bất kỳ từ <span className="text-[#0d9488] font-mono font-bold">A-01</span> đến <span className="text-[#0d9488] font-mono font-bold">A-06</span> trên mô hình 3D để xem chi tiết thông số cảm biến thực tế.
          </p>
        </div>
        {renderSixSlotsGrid()}
      </div>
    );
  }

  const isEmpty = slot.status === 'empty';
  const displayDistance = Math.max(20, Math.round(slot.sensorDistance + jitterDistance));
  const displayTemp = (slot.temperature + jitterTemp).toFixed(1);

  const getParkingDurationStr = () => {
    if (!slot.car) return '';
    const elapsedSeconds = Math.max(1, Math.floor((new Date().getTime() - slot.car.entryTime.getTime()) / 1000));
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${mins} phút ${secs} giây`;
  };

  return (
    <div className="w-full bg-white border border-zinc-200/60 rounded-2xl p-6 flex flex-col justify-between shadow-2xl h-full matte-shadow text-left">
      
      {/* Dynamic Data Module */}
      <div className="flex flex-col gap-5">
        
        {/* Header Indicator */}
        <div className="flex justify-between items-start border-b border-zinc-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isEmpty ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'}`} />
              <h4 className="font-display text-md font-bold text-zinc-900 tracking-widest">
                Ô GỬI XE {slot.label}
              </h4>
            </div>
            <p className="text-[9px] text-zinc-450 font-mono tracking-widest mt-1 uppercase">
              ĐỊA CHỈ SENSOR: RTU-100{slot.id}
            </p>
          </div>

          <span
            className={`text-[9.5px] px-2 py-0.5 rounded font-mono font-bold tracking-wider border ${
              isEmpty
                ? 'bg-emerald-50/60 text-emerald-700 border-emerald-200/50'
                : 'bg-rose-50/60 text-rose-700 border-rose-200/50'
            }`}
          >
            {isEmpty ? 'CÒN TRỐNG' : 'ĐANG ĐỖ'}
          </span>
        </div>

        {/* Sensory grids of twin hardware */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Ultrasonic sensor */}
          <div className="border border-zinc-100 bg-zinc-50/50 p-3.5 rounded-xl flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest block">
                [ SRF05 ] SIÊU ÂM
              </span>
              <p className="font-display text-lg font-bold text-zinc-900 mt-1">
                {displayDistance} <span className="text-[9.5px] font-mono text-zinc-400">cm</span>
              </p>
            </div>
            
            {/* Visualizer columns representing occupancy height */}
            <div className="h-6 flex items-end gap-[1.5px] mt-3 pt-1">
              {Array.from({ length: 12 }).map((_, i) => {
                const stepHeight = isEmpty
                  ? (65 + (i % 3) * 15 + Math.sin(Date.now() / 800 + i) * 15)
                  : (12 + (i % 2) * 10 + Math.cos(Date.now() / 450 + i) * 6);
                return (
                   <div
                    key={`bar-pulse-${i}`}
                    style={{ height: `${Math.min(100, Math.max(15, stepHeight))}%` }}
                    className={`flex-1 rounded-[0.5px] transition-all duration-300 ${
                      isEmpty ? 'bg-emerald-600/30' : 'bg-rose-600/30'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Environmental temperature */}
          <div className="border border-zinc-100 bg-zinc-50/50 p-3.5 rounded-xl flex flex-col justify-between">
            <div>
              <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-widest block">
                [ PT100 ] NHIỆT ĐỘ
              </span>
              <p className="font-display text-lg font-bold text-zinc-900 mt-1">
                {displayTemp} <span className="text-[9.5px] font-mono text-zinc-400">°C</span>
              </p>
            </div>

            <div className="text-[8.5px] font-mono text-zinc-400 mt-2 uppercase tracking-wide">
              Mô đun sấy vùng {slot.id}
            </div>
          </div>

        </div>

        {/* Regular Vehicle Spec Panel */}
        {!isEmpty && slot.car && (
          <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 space-y-3 animate-fade-in">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
              <span className="text-zinc-800 text-[10px] font-mono tracking-widest uppercase font-bold flex items-center gap-1.5 animate-pulse">
                <Car className="w-3.5 h-3.5 text-[#0d9488]" /> THÔNG TIN PHƯƠNG TIỆN
              </span>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#0d9488]/10 text-[#0d9488] font-mono font-bold uppercase tracking-wider select-none">
                ĐANG ĐỖ XE
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Màu sắc sơn:</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full border border-zinc-300" style={{ backgroundColor: slot.car.color }} />
                  <span className="text-zinc-700 text-[10.5px] uppercase font-bold">{slot.car.color}</span>
                </div>
              </div>

              <div className="flex justify-between">
                <span className="text-zinc-500">Nguồn năng lượng:</span>
                <span className="text-zinc-800 font-semibold uppercase text-[10.5px]">Xăng / Dầu / Điện</span>
              </div>
            </div>
          </div>
        )}

        {/* Timers */}
        {!isEmpty && slot.car && (
          <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3.5 font-mono text-xs space-y-2">
            <div className="flex justify-between text-zinc-650">
              <span className="font-semibold text-zinc-500">Thời gian đỗ:</span>
              <span className="text-zinc-900 font-bold">{getParkingDurationStr()}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-zinc-150 text-emerald-700">
              <span className="text-[9.5px] font-bold uppercase tracking-wider">Hệ thống cảm biến:</span>
              <span className="text-[10px] font-bold tracking-tight uppercase">
                ĐỒNG BỘ TIN CẬY
              </span>
            </div>
          </div>
        )}

        {/* 6 Grid overview showing live states */}
        {renderSixSlotsGrid()}

      </div>

      {/* Trigger Release button or Client Notice */}
      <div className="mt-6 pt-4 border-t border-zinc-100">
        {!isEmpty ? (
          <p className="text-[10.5px] text-zinc-550 bg-zinc-50 border border-zinc-200/50 p-2.5 rounded-lg leading-relaxed text-center font-medium select-none animate-fade-in">
            🔒 Ô đỗ hiện đang được chiếm dụng và được giám sát an toàn tự động bởi cảm biến Modbus.
          </p>
        ) : (
          <p className="text-[10.5px] text-[#0d9488] bg-[#0d9488]/5 border border-[#0d9488]/15 p-2.5 rounded-lg leading-relaxed text-center font-bold select-none animate-fade-in">
            ✓ Ô đỗ hiện đang trống và sẵn sàng trực tuyến đón nhận phương tiện.
          </p>
        )}
      </div>

    </div>
  );
}
