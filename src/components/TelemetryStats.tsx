import React from 'react';
import { ParkingSlot, ParkingTelemetry } from '../types';

interface TelemetryStatsProps {
  slots: ParkingSlot[];
  telemetry: ParkingTelemetry;
}

export default function TelemetryStats({ slots, telemetry }: TelemetryStatsProps) {
  const occupiedCount = slots.filter((s) => s.status === 'occupied').length;
  const occupancyRate = Math.round((occupiedCount / slots.length) * 100);

  // Modbus calibrated 24h average data projection for regular gasoline parking
  const hourlyOccupancy = [
    { hour: '08h', rate: 45 },
    { hour: '10h', rate: 80 },
    { hour: '12h', rate: 100 },
    { hour: '14h', rate: 90 },
    { hour: '16h', rate: 70 },
    { hour: '18h', rate: 85 },
    { hour: '20h', rate: 60 },
    { hour: '22h', rate: 30 },
  ];

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 bg-white border border-zinc-200/60 rounded-2xl p-6 md:p-8 matte-shadow">
      
      {/* SECTION A (span 4): Giant focal occupancy metric */}
      <div className="md:col-span-4 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-150 pb-6 md:pb-0 pr-0 md:pr-8">
        <div>
          <p className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase font-bold">
            HIỆN TRẠNG QUẢN LÝ ĐỖ XE
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-5xl md:text-6xl font-light text-zinc-900 tracking-tighter">
              {occupiedCount}<span className="text-zinc-300">/</span>{slots.length}
            </span>
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-2 font-bold">
              Ô CÒN TRỐNG: {slots.length - occupiedCount}
            </span>
          </div>
        </div>
        
        <div className="mt-6">
          <div className="w-full bg-zinc-100 rounded-full h-[4px]">
            <div 
              style={{ width: `${occupancyRate}%` }}
              className="bg-zinc-800 h-[4px] rounded-full transition-all duration-1000"
            />
          </div>
          <div className="flex justify-between items-center mt-2 text-[11px] font-mono text-zinc-500">
            <span>Hiệu suất sử dụng bãi</span>
            <span className="font-bold text-zinc-800">{occupancyRate}%</span>
          </div>
        </div>
      </div>

      {/* SECTION B (span 4): Traditional Petrol Car Metrics & Sensor Performance */}
      <div className="md:col-span-4 flex flex-col justify-between gap-6 border-b md:border-b-0 md:border-r border-zinc-150 pb-6 md:pb-0 pr-0 md:pr-8">
        {/* Total vehicles Entered */}
        <div>
          <span className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase font-bold block">
            TỔNG LƯỢT XE ĐÃ GỬI TRONG NGÀY
          </span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-zinc-900">
              {telemetry.totalVehiclesEntered}
            </span>
            <span className="text-[11px] font-mono uppercase font-bold text-zinc-500">
              lượt xe
            </span>
          </div>
          <p className="text-[10.5px] text-zinc-505 mt-1 text-zinc-500">
            Gồm các loại SUV, Sedan và xe bán tải đa dụng
          </p>
        </div>

        {/* Financial telemetry replaced with Sensor Performance stats */}
        <div className="pt-2">
          <span className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase font-bold block">
            HIỆU SUẤT CẢM BIẾN ĐO LƯỜNG
          </span>

          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-bold text-emerald-600 animate-pulse">
              99.98%
            </span>
            <span className="text-[11px] font-mono text-emerald-605 uppercase font-semibold">
              TIN CẬY
            </span>
          </div>
          <p className="text-[10.5px] text-zinc-500 mt-1">
            06 đầu cảm biến Modbus RTU phản hồi thời gian thực dưới 15ms
          </p>
        </div>
      </div>

      {/* SECTION C (span 4): 24-hour Density distribution chart */}
      <div className="md:col-span-4 flex flex-col justify-between pl-0 md:pl-2">
        <div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase font-bold">
              MẬT ĐỘ XE THEO GIỜ
            </span>
            <span className="text-[8.5px] font-mono text-zinc-650 bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider">
              LƯỢT TRUY CẬP
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Chỉ số phản ánh lưu lượng dồn dập vào buổi trưa
          </p>
        </div>

        {/* Minimal Matte Histogram */}
        <div className="h-16 flex items-end justify-between gap-1.5 mt-4 pt-2">
          {hourlyOccupancy.map((item, index) => (
            <div key={`metrics-bar-${index}`} className="flex-1 flex flex-col items-center group relative cursor-pointer">
              {/* Micro-tooltip */}
              <div className="absolute bottom-full mb-1.5 bg-zinc-900 text-white border border-zinc-800 px-2 py-1 rounded text-[8.5px] font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50 shadow-md">
                {item.rate}%
              </div>
              <div 
                style={{ height: `${item.rate * 0.45}px` }}
                className={`w-full rounded-t-[1.5px] transition-all duration-300 ${
                  item.rate >= 80 
                    ? 'bg-zinc-805 group-hover:bg-emerald-650' 
                    : 'bg-zinc-200 group-hover:bg-zinc-400'
                }`}
              />
              <span className="text-[8px] font-mono text-zinc-405 mt-1.5 tracking-tighter select-none font-extrabold text-zinc-400">{item.hour}</span>
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
}
