import React from 'react';
import { Gate, ActivityLog } from '../types';

interface ControlPanelProps {
  gates: Gate[];
  logs: ActivityLog[];
  onManualGateOverride: (gateId: 'entrance' | 'exit', action: 'open' | 'close') => void;
  onResetSimulation: () => void;
  onClearLogs: () => void;
}

export default function ControlPanel({
  gates,
  logs,
  onManualGateOverride,
  onResetSimulation,
  onClearLogs,
}: ControlPanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 bg-white border border-zinc-200/60 rounded-2xl p-6 md:p-8 matte-shadow">
      
      {/* COLUMN 1 (span 4): IoT Gateway Details & Relay Overrides */}
      <div className="md:col-span-4 flex flex-col justify-between gap-6 border-b md:border-b-0 md:border-r border-zinc-150 pb-6 md:pb-0 pr-0 md:pr-8">
        <div>
          <span className="text-[10px] tracking-[0.2em] text-[#0d9488] uppercase font-bold block select-none">
            THÔNG SỐ KÊNH TRUYỀN IOT
          </span>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
            Hệ thống đang hoạt động ở chế độ trực tuyến (Production Mode). Đang lắng nghe luồng dữ liệu truyền thẳng từ cảm biến Modbus RTU và đầu đọc thẻ RFID của bạn.
          </p>
        </div>

        {/* Connection status card */}
        <div className="bg-zinc-50 border border-zinc-200/60 rounded-xl p-4.5 space-y-2.5">
          <div className="flex justify-between items-center text-[10.5px]">
            <span className="text-zinc-550 font-medium">Giao thức:</span>
            <span className="font-mono font-bold text-zinc-900 bg-zinc-200 px-1.5 py-0.5 rounded text-[9.5px]">MQTT & MODBUS TCP</span>
          </div>
          <div className="flex justify-between items-center text-[10.5px]">
            <span className="text-zinc-550 font-medium">Topic Telemetry:</span>
            <span className="font-mono font-semibold text-zinc-700">esp/telemetry</span>
          </div>
          <div className="flex justify-between items-center text-[10.5px]">
            <span className="text-zinc-550 font-medium">Topic RFID/Barrier:</span>
            <span className="font-mono font-semibold text-zinc-700">esp/rfid</span>
          </div>
          <div className="flex justify-between items-center text-[10.5px]">
            <span className="text-zinc-550 font-medium">Trạng thái Broker:</span>
            <span className="text-[#0d9488] font-bold flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#0d9488] animate-ping" />
              ĐANG KẾT NỐI
            </span>
          </div>
        </div>

        {/* Barrier Manual toggler overrides */}
        <div className="border-t border-zinc-150 pt-4.5 space-y-3.5">
          <span className="text-[9px] font-mono tracking-widest text-zinc-400 uppercase block font-bold">
            Ghi Đè Thanh Chắn (Relay Overrides)
          </span>

          {gates.map((g) => (
            <div key={g.id} className="flex justify-between items-center text-xs">
              <span className="font-mono text-[10px] text-zinc-550 capitalize font-semibold">
                {g.id === 'entrance' ? 'Barrier Vào (IN)' : 'Barrier Ra (OUT)'}:
              </span>
              <button
                onClick={() => onManualGateOverride(g.id as 'entrance' | 'exit', g.status === 'open' ? 'close' : 'open')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase transition-all duration-250 cursor-pointer border select-none active:scale-95 ${
                  g.status === 'open' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50 font-extrabold hover:bg-emerald-100' 
                    : 'bg-rose-50 text-rose-700 border-rose-200/50 font-extrabold hover:bg-rose-100'
                }`}
                id={`btn-override-toggle-${g.id}`}
              >
                {g.status === 'open' ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    ĐANG MỞ (OPEN)
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    ĐANG ĐÓNG (CLOSE)
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Memory state reset action */}
        <div className="pt-2">
          <button
            onClick={onResetSimulation}
            className="w-full py-2 text-[9px] font-mono font-bold text-zinc-400 hover:text-[#be123c] text-center uppercase tracking-widest transition-all cursor-pointer"
            id="btn-reset-sim"
          >
            [ Thiết lập lại bộ nhớ đệm bãi đỗ ]
          </button>
        </div>
      </div>

      {/* COLUMN 2 (span 8): Real-time live event timelines */}
      <div className="md:col-span-8 flex flex-col justify-between gap-5 pl-0 md:pl-2">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[10px] tracking-[0.2em] text-zinc-550 uppercase font-bold block">
              DIỄN BIẾN HOẠT ĐỘNG THỜI GIAN THỰC
            </span>
            <p className="text-[11px] text-zinc-500 mt-1">
              Dòng dữ liệu tín hiệu IoT nhận diện cổng từ đầu đọc thẻ RFID vật lý và cảm biến Modbus
            </p>
          </div>

          <button
            onClick={onClearLogs}
            className="text-[9px] font-mono text-zinc-400 hover:text-zinc-700 uppercase tracking-widest font-semibold"
            id="btn-clear-logs"
          >
            [ Xóa lịch sử ]
          </button>
        </div>

        {/* Micro ledger event history */}
        <div className="flex-1 bg-zinc-50/50 border border-zinc-200/80 rounded-lg p-4 font-mono text-[11px] h-[215px] overflow-y-auto space-y-2">
          {logs.length === 0 ? (
            <p className="text-zinc-400 text-center pt-20 select-none">
              Hệ thống trực tuyến. Đang lắng nghe luồng tín hiệu Modbus & RFID truyền vào...
            </p>
          ) : (
            logs.map((log) => {
              // Map types to beautiful micro text labels
              let tagColor = 'text-zinc-400';
              let tagPrefix = 'SYS';
              
              if (log.type === 'warning') {
                tagColor = 'text-[#be123c]';
                tagPrefix = 'ALRT';
              } else if (log.type === 'scan') {
                tagColor = 'text-[#b45309]';
                tagPrefix = 'RFID';
              } else if (log.type === 'gate') {
                tagColor = 'text-zinc-650';
                tagPrefix = 'GATE';
              } else if (log.type === 'parking') {
                tagColor = 'text-[#15803d]';
                tagPrefix = 'TWIN';
              }

              return (
                <div key={log.id} className="flex gap-3 text-[10.5px] items-start hover:bg-zinc-100/50 py-0.5 rounded px-1 group transition-colors duration-200 border-b border-zinc-100/40 last:border-0 pb-1">
                  <span className="text-zinc-400 select-none shrink-0">{log.timestamp}</span>
                  <span className={`font-bold select-none shrink-0 ${tagColor}`}>[{tagPrefix}]</span>
                  <span className="text-zinc-805 leading-normal text-zinc-800 font-medium">{log.message}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-between items-center text-[9px] font-mono text-zinc-400 px-1 select-none font-semibold">
          <span>Modbus TCP Gateway: 127.0.0.1:502</span>
          <span>Dữ liệu đồng bộ trực tiếp từ thiết bị truyền tin vật lý</span>
        </div>
      </div>

    </div>
  );
}
