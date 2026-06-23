import React, { useState, useEffect } from 'react';
import mqtt from 'mqtt';
import { ParkingSlot, Car, Gate, ActivityLog, ParkingTelemetry } from './types';
import IsometricView from './components/IsometricView';
import SlotDetails from './components/SlotDetails';
import ControlPanel from './components/ControlPanel';
import TelemetryStats from './components/TelemetryStats';
import TiltCard from './components/TiltCard';
import InteractiveCarCard from './components/InteractiveCarCard';

// Siren system AudioContext generators
let audioCtx: AudioContext | null = null;
let sirenInterval: any = null;

const startSirenSound = () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (sirenInterval) return; // already active
    
    let odd = false;
    sirenInterval = setInterval(() => {
      try {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth'; // buzzer/siren tone
        osc.frequency.setValueAtTime(odd ? 1100 : 650, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime); // low safety amplitude
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.28);
        odd = !odd;
      } catch (err) {
        // fail gracefully if browser restricts audio context
      }
    }, 400);
  } catch (error) {
    console.error('Audio initialization failed', error);
  }
};

const stopSirenSound = () => {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
};

const INITIAL_SLOTS: ParkingSlot[] = [
  {
    id: 1,
    label: 'A-01',
    status: 'empty',
    isEVCharging: false,
    sensorDistance: 220,
    temperature: 24.5,
    car: null
  },
  {
    id: 2,
    label: 'A-02',
    status: 'empty',
    isEVCharging: false,
    sensorDistance: 220,
    temperature: 24.5,
    car: null
  },
  {
    id: 3,
    label: 'A-03',
    status: 'empty',
    isEVCharging: false,
    sensorDistance: 220,
    temperature: 24.5,
    car: null
  },
  {
    id: 4,
    label: 'A-04',
    status: 'empty',
    isEVCharging: false,
    sensorDistance: 220,
    temperature: 24.5,
    car: null
  },
  {
    id: 5,
    label: 'A-05',
    status: 'empty',
    isEVCharging: false,
    sensorDistance: 220,
    temperature: 24.5,
    car: null
  },
  {
    id: 6,
    label: 'A-06',
    status: 'empty',
    isEVCharging: false,
    sensorDistance: 220,
    temperature: 24.5,
    car: null
  }
];

const INITIAL_GATES: Gate[] = [
  {
    id: 'entrance',
    name: 'Cổng Số 1 (Vào)',
    status: 'closed',
    lastPlate: 'Chưa có thẻ quẹt',
    scannerLog: 'Hệ thống sẵn sàng'
  },
  {
    id: 'exit',
    name: 'Cổng Số 2 (Ra)',
    status: 'closed',
    lastPlate: 'Chưa có thẻ quẹt',
    scannerLog: 'Hệ thống sẵn sàng'
  }
];

const INITIAL_TELEMETRY: ParkingTelemetry = {
  revenue: 0, 
  totalVehiclesEntered: 0,
  totalVehiclesExited: 0,
  averageStaySeconds: 0
};

export default function App() {
  const [slots, setSlots] = useState<ParkingSlot[]>(INITIAL_SLOTS);
  const [gates, setGates] = useState<Gate[]>(INITIAL_GATES);
  const [telemetry, setTelemetry] = useState<ParkingTelemetry>(INITIAL_TELEMETRY);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(1); // Defaults to Slot 1
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Manager/Admin state variables
  const [isManager, setIsManager] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  // MQTT Connection state variables
  const [mqttStatus, setMqttStatus] = useState<'connected' | 'disconnected' | 'connecting' | 'reconnecting' | 'error'>('disconnected');
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState<string>('wss://broker.hivemq.com:8884/mqtt');
  const [mqttTelemetryTopic, setMqttTelemetryTopic] = useState<string>('esp/telemetry');
  const [mqttRfidTopic, setMqttRfidTopic] = useState<string>('esp/rfid');
  const [lastReceivedMessage, setLastReceivedMessage] = useState<{ topic: string; payload: string; time: string } | null>(null);
  const [sirenActive, setSirenActive] = useState<boolean>(false);
  const [alarmMessage, setAlarmMessage] = useState<string>('');

  // Routing and updating BATCH_SLOTS packets cleanly
  const handleBatchSlotsUpdate = (slotsData: Array<{ slotId: number; status: string; dist: number }>) => {
    setSlots((prevSlots) => {
      let changeDetected = false;
      const updated = prevSlots.map((slot) => {
        const match = slotsData.find((d) => d.slotId === slot.id);
        if (!match) return slot;

        const isOccupied = match.status === 'CÓ XE';
        const wasOccupied = slot.status === 'occupied';

        if (isOccupied && !wasOccupied) {
          changeDetected = true;
          const randomColor = getRandomCarColor();

          addLog('parking', `[MQTT] Phát hiện XE VÀO ô ${slot.label}. Khoảng cách: ${match.dist}cm.`);
          
          setTelemetry((prev) => ({
            ...prev,
            totalVehiclesEntered: prev.totalVehiclesEntered + 1,
            revenue: prev.revenue + 40
          }));

          return {
            ...slot,
            status: 'occupied',
            sensorDistance: match.dist,
            temperature: Math.floor(34 + Math.random() * 4),
            car: {
              id: `car-${Date.now()}-${slot.id}`,
              plateNumber: '',
              color: randomColor,
              type: 'sedan',
              entryTime: new Date(),
              temperature: Math.floor(34 + Math.random() * 4)
            }
          };
        } else if (!isOccupied && wasOccupied) {
          changeDetected = true;
          addLog('parking', `[MQTT] Phát hiện XE RỜI ô ${slot.label}. Giải phóng ô thành TRỐNG. Khoảng cách: ${match.dist}cm.`);
          
          setTelemetry((prev) => ({
            ...prev,
            totalVehiclesExited: prev.totalVehiclesExited + 1,
            revenue: prev.revenue + 20
          }));

          return {
            ...slot,
            status: 'empty',
            sensorDistance: match.dist,
            car: null
          };
        } else {
          // Keep prior car info if status did not change, just refresh environmental reading
          return {
            ...slot,
            sensorDistance: match.dist,
            temperature: isOccupied ? (slot.temperature || 32) : 24.5
          };
        }
      });

      // Trigger automatic details selection if something changed
      if (changeDetected) {
        const firstOccupied = updated.find(s => s.status === 'occupied');
        if (firstOccupied) {
          setSelectedSlotId(firstOccupied.id);
        }
      }

      return updated;
    });
  };

  // Routing and updating RFID swipes with 5-second automatic safety barriers loop
  const handleRfidUpdate = (data: { gate: 'ENTRY' | 'EXIT'; card: string; auth: 'VALID' | 'INVALID'; wrong_count?: number }) => {
    const isEntry = data.gate === 'ENTRY';
    const gateId = isEntry ? 'entrance' : 'exit';
    const gateName = isEntry ? 'Cổng Số 1 (Vào)' : 'Cổng Số 2 (Ra)';

    if (data.auth === 'VALID') {
      addLog('scan', `[RFID] Thẻ HỢP LỆ: ${data.card} tại ${gateName}. Lệnh mở rào chắn.`);
      setGates((prev) =>
        prev.map((g) => (g.id === gateId ? { ...g, status: 'open', lastPlate: `CARD: ${data.card}` } : g))
      );

      // Auto restore gate to closed state after 5 seconds to simulate physics servo sweep
      setTimeout(() => {
        setGates((prev) =>
          prev.map((g) => (g.id === gateId ? { ...g, status: 'closed' } : g))
        );
        addLog('gate', `[Barrier] Đã hạ thanh chắn ${gateName} tự động sau 5 giây.`);
      }, 5000);

    } else {
      const count = data.wrong_count || 1;
      addLog('warning', `[RFID] THẺ SAI: ${data.card} tại ${gateName}. Còi tít lần thứ ${count}!`);
      
      if (count >= 3) {
        addLog('warning', `[BÁO ĐỘNG] CÒI BÚ RÚ: Thẻ quẹt sai hỏng liên tục ${count} lần ở ${gateName}!`);
        setSirenActive(true);
        setAlarmMessage(`Cảnh báo đột nhập: Mã thẻ ${data.card} quẹt trái phép liên tiếp từ 3 lần ở ${gateName}`);
      }
    }
  };

  // Handle live MQTT.js connection context
  useEffect(() => {
    let client: any = null;
    addLog('info', `[MQTT] Đang tạo kênh kết nối bảo mật tới: ${mqttBrokerUrl}...`);
    setMqttStatus('connecting');

    try {
      client = mqtt.connect(mqttBrokerUrl, {
        connectTimeout: 5000,
        reconnectPeriod: 3000,
        clean: true,
      });

      client.on('connect', () => {
        setMqttStatus('connected');
        addLog('info', `[MQTT] Kết nối thành công với Broker: ${mqttBrokerUrl}`);

        client.subscribe(mqttTelemetryTopic, (err: any) => {
          if (!err) {
            addLog('info', `[MQTT] Đã lắng nghe topic telemetry: "${mqttTelemetryTopic}"`);
          } else {
            addLog('warning', `[MQTT] Lỗi subscribe "${mqttTelemetryTopic}": ${err.message}`);
          }
        });

        client.subscribe(mqttRfidTopic, (err: any) => {
          if (!err) {
            addLog('info', `[MQTT] Đã lắng nghe topic RFID: "${mqttRfidTopic}"`);
          } else {
            addLog('warning', `[MQTT] Lỗi subscribe "${mqttRfidTopic}": ${err.message}`);
          }
        });
      });

      client.on('message', (topic: string, message: Buffer) => {
        const payloadStr = message.toString();
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setLastReceivedMessage({
          topic,
          payload: payloadStr,
          time: timeStr
        });

        try {
          const parsed = JSON.parse(payloadStr);
          if (topic === mqttTelemetryTopic) {
            if (parsed.type === 'BATCH_SLOTS' && Array.isArray(parsed.slotsData)) {
              handleBatchSlotsUpdate(parsed.slotsData);
            }
          } else if (topic === mqttRfidTopic) {
            handleRfidUpdate(parsed);
          }
        } catch (err: any) {
          addLog('warning', `[MQTT] Nhận sai định dạng JSON trên topic "${topic}": ${payloadStr}`);
        }
      });

      client.on('reconnect', () => {
        setMqttStatus('reconnecting');
      });

      client.on('error', (err: any) => {
        setMqttStatus('error');
        console.error('MQTT Connection error', err);
      });

      client.on('close', () => {
        setMqttStatus('disconnected');
      });

    } catch (error: any) {
      setMqttStatus('error');
      addLog('warning', `[MQTT] Khởi động truyền tin tức thời gập lỗi: ${error.message}`);
    }

    return () => {
      if (client) {
        client.end();
      }
    };
  }, [mqttBrokerUrl, mqttTelemetryTopic, mqttRfidTopic]);

  // Audio buzz alert trigger monitor
  useEffect(() => {
    if (sirenActive) {
      startSirenSound();
    } else {
      stopSirenSound();
    }
    return () => {
      stopSirenSound();
    };
  }, [sirenActive]);

  // Log system initialization
  useEffect(() => {
    addLog('info', 'Hệ thống Digital Twin 3D khởi tạo thành công.');
    addLog('info', 'Đã thiết lập kênh truyền thông Modbus RTU TCP/IP tới 6 kênh cảm biến.');
    addLog('info', 'Đầu đọc thẻ RFID kiểm soát barrier sẵn sàng hoạt động.');
  }, []);

  // Time system clock loop
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Hardware Mock virtual functions
  const [simulatedWrongCount, setSimulatedWrongCount] = useState<number>(0);

  const simulateMqttTelemetryWithVehicle = () => {
    const mockData = {
      type: "BATCH_SLOTS",
      slotsData: [
        { slotId: 1, status: Math.random() > 0.45 ? "CÓ XE" : "TRỐNG", dist: Math.floor(25 + Math.random() * 25) },
        { slotId: 2, status: Math.random() > 0.45 ? "CÓ XE" : "TRỐNG", dist: Math.floor(25 + Math.random() * 25) },
        { slotId: 3, status: "TRỐNG", dist: 135 },
        { slotId: 4, status: Math.random() > 0.5 ? "CÓ XE" : "TRỐNG", dist: Math.floor(25 + Math.random() * 25) },
        { slotId: 5, status: "TRỐNG", dist: 128 },
        { slotId: 6, status: "CÓ XE", dist: 22 }
      ]
    };
    addLog('info', `[SIMULATOR] Phát gói telemetry giả lập: "esp/telemetry"`);
    handleBatchSlotsUpdate(mockData.slotsData);
    setLastReceivedMessage({
      topic: mqttTelemetryTopic,
      payload: JSON.stringify(mockData),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
  };

  const simulateMqttTelemetryClear = () => {
    const mockData = {
      type: "BATCH_SLOTS",
      slotsData: [
        { slotId: 1, status: "TRỐNG", dist: 210 },
        { slotId: 2, status: "TRỐNG", dist: 205 },
        { slotId: 3, status: "TRỐNG", dist: 222 },
        { slotId: 4, status: "TRỐNG", dist: 215 },
        { slotId: 5, status: "TRỐNG", dist: 220 },
        { slotId: 6, status: "TRỐNG", dist: 218 }
      ]
    };
    addLog('info', `[SIMULATOR] Phát telemetry giả lập TRỐNG: "esp/telemetry"`);
    handleBatchSlotsUpdate(mockData.slotsData);
    setLastReceivedMessage({
      topic: mqttTelemetryTopic,
      payload: JSON.stringify(mockData),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
  };

  const simulateMqttRfidValid = (gate: 'ENTRY' | 'EXIT') => {
    const cardHex = gate === 'ENTRY' ? 'F3521435' : '43702E1B';
    const mockData = {
      gate,
      card: cardHex,
      auth: "VALID" as const
    };
    addLog('info', `[SIMULATOR] Thẻ HỢP LỆ ở cổng ${gate}: "${mqttRfidTopic}"`);
    handleRfidUpdate(mockData);
    setLastReceivedMessage({
      topic: mqttRfidTopic,
      payload: JSON.stringify(mockData),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
  };

  const simulateMqttRfidInvalid = (forceThird: boolean) => {
    const nextCount = forceThird ? 3 : (simulatedWrongCount + 1);
    setSimulatedWrongCount(forceThird ? 3 : nextCount);

    const mockData = {
      gate: "ENTRY" as const,
      card: "1A2B3C4D",
      auth: "INVALID" as const,
      wrong_count: nextCount
    };

    addLog('info', `[SIMULATOR] Quẹt thẻ SAI (Lần thứ ${nextCount}): "${mqttRfidTopic}"`);
    handleRfidUpdate(mockData);
    setLastReceivedMessage({
      topic: mqttRfidTopic,
      payload: JSON.stringify(mockData),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });

    if (nextCount >= 3) {
      setSimulatedWrongCount(0); // clear count
    }
  };

  // Real-time engine temperature simulation: hot engines slowly cool down to ambient temp
  useEffect(() => {
    const interval = setInterval(() => {
      setSlots((prevSlots) =>
        prevSlots.map((slot) => {
          if (slot.status === 'occupied' && slot.car) {
            const currentTemp = slot.car.temperature || 35;
            if (currentTemp > 28) {
              const nextTemp = Math.round((currentTemp - 0.2) * 10) / 10;
              return {
                ...slot,
                temperature: nextTemp,
                car: {
                  ...slot.car,
                  temperature: nextTemp
                }
              };
            }
          }
          return slot;
         })
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // System logging tracker
  const addLog = (type: ActivityLog['type'], message: string) => {
    // Only capture real MQTT / RFID / Barrier and authentic admin overrides / System init events
    const isMockSimulatorMsg = 
      message.includes('[SIMULATOR]') || 
      message.includes('Cổng 1') || 
      message.includes('Cổng 2') || 
      message.includes('Cảm biến tiếp cận phát hiện') || 
      message.includes('Yêu cầu xuất bãi') || 
      message.includes('Giải tỏa ô đỗ') || 
      message.includes('Bắt đầu quá trình lấy xe') || 
      message.includes('HỆ THỐNG TRỐNG') || 
      message.includes('BÁO ĐỘNG HỆ THỐNG: Bãi đỗ xe đã đầy');

    if (isMockSimulatorMsg) {
      return; // Skip and discard mock simulation logs
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: timeStr,
      type,
      message
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  // ARRIVAL SIMULATION SEQUENCE
  const handleTriggerRandomEntry = () => {
    const emptySlots = slots.filter((s) => s.status === 'empty');
    if (emptySlots.length === 0) {
      addLog('warning', 'BÁO ĐỘNG HỆ THỐNG: Bãi đỗ xe đã đầy (6/6). Không thể nhận thêm phương tiện!');
      return;
    }

    addLog('info', 'Cảm biến tiếp cận phát hiện phương tiện tới gần barrier Cổng 1 (IN).');

    // Activate scanner phase
    setGates((prev) =>
      prev.map((g) => (g.id === 'entrance' ? { ...g, status: 'scanner_active' } : g))
    );

    // After scanning completes
    setTimeout(() => {
      const generatedPlate = generateVietnamesePlate();
      const randomColor = getRandomCarColor();
      const carTypes: Car['type'][] = ['sedan', 'suv', 'truck'];
      const randomType = carTypes[Math.floor(Math.random() * carTypes.length)];

      addLog('scan', `Camera Cổng 1 nhận dạng biển số: ${generatedPlate} | Dòng xe: ${randomType.toUpperCase()}.`);

      setGates((prev) =>
        prev.map((g) =>
          g.id === 'entrance' ? { ...g, status: 'open', lastPlate: generatedPlate } : g
        )
      );
      addLog('gate', 'Kích hoạt mở rào chắn Cổng 1. Cho phép phương tiện đi vào.');

      // Place vehicle in free spot
      setTimeout(() => {
        setSlots((currentSlots) => {
          const avail = currentSlots.filter((s) => s.status === 'empty');
          if (avail.length === 0) return currentSlots;

          const chosenSlot = avail[0]; 
          addLog('parking', `Xe biển số ${generatedPlate} đã di chuyển vào ô đỗ ${chosenSlot.label} an toàn.`);

          // Focus on this space immediately
          setSelectedSlotId(chosenSlot.id);

          setTelemetry((prev) => ({
            ...prev,
            totalVehiclesEntered: prev.totalVehiclesEntered + 1,
            revenue: prev.revenue + 40 
          }));

          return currentSlots.map((s) => {
            if (s.id === chosenSlot.id) {
              return {
                ...s,
                status: 'occupied',
                sensorDistance: 45, 
                car: {
                  id: `car-${Date.now()}`,
                  plateNumber: generatedPlate,
                  color: randomColor,
                  type: randomType,
                  entryTime: new Date(),
                  temperature: Math.floor(36 + Math.random() * 4)
                }
              };
            }
            return s;
          });
        });

        // Close barrier
        setGates((prev) =>
          prev.map((g) => (g.id === 'entrance' ? { ...g, status: 'closed' } : g))
        );
        addLog('gate', 'Barrier Cổng 1 tự động đóng hạ an toàn.');
      }, 2005);
    }, 1300);
  };

  // DEPARTURE SIMULATION SEQUENCE
  const handleTriggerRandomExit = () => {
    const occupiedSlots = slots.filter((s) => s.status === 'occupied' && s.car);
    if (occupiedSlots.length === 0) {
      addLog('warning', 'HỆ THỐNG TRỐNG: Không có xe nào đang đỗ để thực hiện lệnh kiểm soát ra.');
      return;
    }

    const randomSlot = occupiedSlots[Math.floor(Math.random() * occupiedSlots.length)];
    const departingCar = randomSlot.car!;

    addLog('info', `Yêu cầu xuất bãi cho xe ${departingCar.plateNumber} tại ô ${randomSlot.label}.`);

    // Vacate parking spot instantly
    setSlots((prev) =>
      prev.map((s) =>
        s.id === randomSlot.id
          ? { ...s, status: 'empty', car: null, isEVCharging: false, sensorDistance: 220 }
          : s
      )
    );
    addLog('parking', `Giải tỏa ô đỗ ${randomSlot.label}. Trạng thái ô: TRỐNG/KHẢ DỤNG.`);

    // Active exit scanner
    setGates((prev) =>
      prev.map((g) => (g.id === 'exit' ? { ...g, status: 'scanner_active' } : g))
    );

    // Resolution after scan completes
    setTimeout(() => {
      const secondsStayed = Math.max(12, Math.floor((Date.now() - departingCar.entryTime.getTime()) / 1000));
      const simulatedPointsGained = secondsStayed * 2; 

      addLog('scan', `Camera Cổng 2 nhận diện biển số: ${departingCar.plateNumber}.`);
      addLog('scan', `Xác nhận xe rời bãi. Tổng thời gian đỗ: ${secondsStayed} giây.`);

      setGates((prev) =>
        prev.map((g) =>
          g.id === 'exit' ? { ...g, status: 'open', lastPlate: departingCar.plateNumber } : g
        )
      );
      addLog('gate', 'Mở tự động barrier Cổng 2. Cho phép phương tiện rời bãi.');

      setTelemetry((prev) => ({
        ...prev,
        totalVehiclesExited: prev.totalVehiclesExited + 1,
        revenue: prev.revenue + 20
      }));

      // Close Barrier arm after 2 seconds
      setTimeout(() => {
        setGates((prev) =>
          prev.map((g) => (g.id === 'exit' ? { ...g, status: 'closed' } : g))
        );
        addLog('gate', 'Barrier Cổng 2 tự động hạ an toàn sau khi xe đi qua.');
      }, 2000);
    }, 1500);
  };

  // Immediate release slot option (retrieval mock)
  const handleReleaseSlot = (slotId: number) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || slot.status === 'empty' || !slot.car) return;

    addLog('info', `Bắt đầu quá trình lấy xe ${slot.car.plateNumber} tại ô ${slot.label}.`);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, status: 'empty', car: null, isEVCharging: false, sensorDistance: 220 }
          : s
      )
    );
    setTelemetry((prev) => ({
      ...prev,
      totalVehiclesExited: prev.totalVehiclesExited + 1,
      revenue: prev.revenue + 20 
    }));
  };

  // Manual operators gate controls override
  const handleManualGateOverride = (gateId: 'entrance' | 'exit', action: 'open' | 'close') => {
    setGates((prev) =>
      prev.map((g) => {
        if (g.id === gateId) {
          const status = action === 'open' ? 'open' : 'closed';
          addLog('gate', `Quản trị viên ghi đè thủ công ${g.name} -> ${status.toUpperCase()}.`);
          return { ...g, status };
        }
        return g;
      })
    );
  };

  // General check toggler
  const handleToggleEVCharging = (slotId: number) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id === slotId) {
          addLog('parking', `Gửi tín hiệu kiểm tra định chuẩn cảm biến siêu âm ô ${s.label}: THIẾT LẬP LẠI.`);
          return { ...s, sensorDistance: 45 };
        }
        return s;
      })
    );
  };

  // Entirely clear active entities simulation state
  const handleResetSimulation = () => {
    setSlots((current) =>
      current.map((s) => ({
        ...s,
        status: 'empty',
        car: null,
        isEVCharging: false,
        sensorDistance: 220,
        temperature: 24.5
      }))
    );
    setGates((current) =>
      current.map((g) => ({ ...g, status: 'closed', lastPlate: undefined }))
    );
    setSelectedSlotId(null);
    addLog('warning', 'Đã Reset tất cả trạng thái bãi đỗ về cấu hình rảnh.');
  };

  return (
    <div className="min-h-screen bg-[#fcfbfa] text-[#1c1d21] font-sans antialiased">
      
      {/* SECURITY SIREN FLASHING ALARM BANNER (MQTT INTELLIGENT WRONG COUNT SENSOR ALERT) */}
      {sirenActive && (
        <div className="bg-rose-600 text-white border-b-4 border-rose-800 p-4 animate-pulse sticky top-0 z-[100] shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4 transition-all duration-300">
          <div className="flex items-center gap-3">
            <span className="text-3xl animate-bounce shrink-0">🚨</span>
            <div>
              <p className="font-display font-black text-sm tracking-widest uppercase">
                HỆ THỐNG AN NINH: CÒI BÚ RÚ ĐANG HOẠT ĐỘNG! (SIREN SYSTEM TRIGGERED)
              </p>
              <p className="font-mono text-xs text-rose-100 mt-0.5 leading-relaxed">
                {alarmMessage}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setSirenActive(false);
              addLog('info', 'Quản trị viên đã tắt còi báo động an ninh thủ công.');
            }}
            className="bg-white text-rose-700 font-mono text-[10px] tracking-widest uppercase font-extrabold py-2 px-5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer shadow-md shadow-rose-900/10 active:scale-95"
          >
            ■ TẮT CÒI BÁO ĐỘNG (MUTE ALARM)
          </button>
        </div>
      )}
      
      {/* 1. NAVIGATION BAR */}
      <nav className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-zinc-200/60 px-6 py-4 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-display font-black text-sm tracking-tighter">
              DT
            </div>
            <div>
              <span className="font-display font-black text-sm tracking-widest text-zinc-900 block">
                TWINPARK
              </span>
              <span className="text-[8px] font-mono font-bold text-[#0d9488] block tracking-widest uppercase">
                COMBUSTION HUB
              </span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-[11px] font-mono uppercase tracking-widest font-bold text-zinc-550">
            <a href="#about" className="hover:text-zinc-950 transition-colors">Giới thiệu</a>
            <a href="#digital-twin" className="hover:text-zinc-950 text-zinc-950 border-b-2 border-zinc-900 pb-1 font-extrabold transition-colors">Bản Đồ 3D Live</a>
            <a href="#features" className="hover:text-zinc-950 transition-colors">Tính năng nổi bật</a>
            <a href="#faq" className="hover:text-zinc-950 transition-colors">Hỏi đáp</a>
          </div>

          <div className="flex items-center gap-3">
            {isManager ? (
              <div className="flex items-center gap-2">
                <span className="hidden lg:inline-block bg-teal-50 text-teal-700 border border-teal-200/50 px-2.5 py-1 text-[9.5px] uppercase font-mono font-bold rounded">
                  QTV LIVE ACTIVE
                </span>
                <button
                  onClick={() => {
                    setIsManager(false);
                    addLog('parking', 'Hệ thống chuyển đổi về Giao diện Khách hàng.');
                  }}
                  className="bg-zinc-900 text-white hover:bg-zinc-800 font-mono text-[10px] tracking-widest uppercase font-bold py-2 px-3.5 rounded transition shadow-sm cursor-pointer"
                  id="btn-logout-manager"
                >
                  🔒 THOÁT QUẢN LÝ
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthError('');
                  setPasswordInput('');
                  setShowAuthModal(true);
                }}
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white font-mono text-[10px] tracking-widest uppercase font-bold py-2 px-4 rounded transition shadow-sm cursor-pointer"
                id="btn-login-manager"
              >
                🔐 DÀNH CHO QUẢN LÝ
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* SWAPPABLE MAIN SCREEN: DEDICATED ADMIN DASHBOARD VS LUXURIOUS CLIENT HOMEPAGE */}
      {isManager ? (
        // ==========================================
        // 🌟 WORKSPACE 1: DEDICATED ADMIN/MANAGER PAGE (BẢN DÀNH RIÊNG CHO QUẢN LÝ)
        // ==========================================
        <main className="max-w-7xl mx-auto px-6 py-10 animate-fade-in text-left">
          
          {/* Admin Dashboard Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-zinc-200/60 mb-8 select-none">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-250/30 text-emerald-700 text-[9px] font-mono font-bold uppercase tracking-widest mb-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                QUẢN TRỊ VIÊN ĐÃ ĐĂNG NHẬP (ADMIN SECURE SESSION)
              </div>
              <h3 className="text-3xl font-display font-black text-zinc-950 uppercase tracking-tight">
                Hệ Thống Quản Lý & Vận Hành Bãi Xe TwinPark
              </h3>
              <p className="text-xs text-zinc-500 mt-1 font-medium">
                Sử dụng bảng dưới để giám sát thời gian thực, điều khiển Barrier thủ công, mô phỏng quẹt thẻ RFID và quản lý còi báo động an ninh.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  setIsManager(false);
                  addLog('parking', 'Đã thoát ra khỏi giao diện quản trị viên bãi đỗ.');
                }}
                className="bg-zinc-900 text-white hover:bg-zinc-800 text-[10px] font-mono font-bold tracking-widest uppercase px-4 py-2.5 rounded-xl transition duration-200 cursor-pointer shadow-md shadow-zinc-950/10 active:scale-95"
                id="btn-admin-logout"
              >
                🔒 THOÁT QUẢN LÝ
              </button>
            </div>
          </div>

          {/* Quick Barrier Controllers & Hardware telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 select-none">
            {gates.map((g) => (
              <div key={g.id} className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-4.5 flex justify-between items-center hover:border-zinc-300 transition duration-200">
                <div className="space-y-1">
                  <span className="text-[8px] font-mono text-zinc-400 uppercase font-black tracking-wider block">THIẾT BỊ BARRIER {g.id === 'entrance' ? 'VÀO' : 'RA'}</span>
                  <h4 className="font-display font-extrabold text-xs text-zinc-900">{g.name}</h4>
                  <p className="text-[9.5px] font-mono text-zinc-500">
                    Thống kê cuối: <span className="text-zinc-800 font-bold">{g.lastPlate}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`px-2.5 py-0.5 rounded-full text-[8.5px] font-mono font-bold uppercase ${
                    g.status === 'open' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    {g.status === 'open' ? 'ĐANG MỞ' : 'ĐANG ĐÓNG'}
                  </span>
                  <button
                    onClick={() => handleManualGateOverride(g.id, g.status === 'open' ? 'close' : 'open')}
                    className="text-[9px] font-mono font-black text-[#0d9488] hover:text-[#0f766e] uppercase tracking-wider underline cursor-pointer"
                  >
                    Đổi Trạng Thái
                  </button>
                </div>
              </div>
            ))}
            
            <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-4.5 flex justify-between items-center">
              <div className="space-y-1">
                <span className="text-[8px] font-mono text-zinc-400 uppercase font-black tracking-wider block">Hạ Tầng Vận Hành Hệ Thống</span>
                <h4 className="font-display font-extrabold text-xs text-zinc-900">MQTT Broker HiveMQ</h4>
                <p className="text-[9.5px] font-mono text-zinc-550 truncate max-w-[190px]">
                  {mqttBrokerUrl}
                </p>
              </div>
              <span className={`w-3 h-3 rounded-full ${mqttStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`} />
            </div>
          </div>

          {/* Telemetry Stats Widgets */}
          <div className="mb-8">
            <div className="mb-2 text-zinc-400 font-mono text-[9px] font-bold uppercase tracking-wider">THỐNG KÊ DOANH THU & REVENUE VẬN HÀNH</div>
            <TelemetryStats slots={slots} telemetry={telemetry} />
          </div>

          {/* Interactive Core Monitoring splits */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch mb-8">
            {/* 3D Map model with admin selection */}
            <div className="lg:col-span-2 h-full flex flex-col">
              <div className="mb-2.5 flex justify-between items-center select-none">
                <span className="text-[10px] uppercase font-mono font-bold text-zinc-400 tracking-wider">
                  Mô hình 3D Digital Twin (Bản đồ giám sát chính)
                </span>
                <span className="text-[9px] font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded font-bold">
                  BẢN ĐỒ DÀNH RIÊNG CHO QUẢN TRỊ VIÊN
                </span>
              </div>
              <IsometricView
                slots={slots}
                gates={gates}
                selectedSlotId={selectedSlotId}
                onSelectSlot={(id) => setSelectedSlotId(id)}
              />
            </div>

            {/* Dynamic slot controller detail form */}
            <div className="lg:col-span-1 h-full flex flex-col">
              <div className="mb-2.5 text-left select-none">
                <span className="text-[10px] uppercase font-mono font-bold text-zinc-400 tracking-wider">
                  Sửa Lỗi / Điều Phối Ô Số {selectedSlotId}
                </span>
              </div>
              <SlotDetails
                slots={slots}
                slot={slots.find((s) => s.id === selectedSlotId) || null}
                onToggleEVCharging={handleToggleEVCharging}
                onReleaseSlot={handleReleaseSlot}
                onSelectSlot={(id) => setSelectedSlotId(id)}
                isAdmin={true}
              />
            </div>
          </div>

          {/* IoT Gateway Monitor and Control Deck */}
          <div className="mt-4 bg-zinc-50 border border-zinc-200 p-6 rounded-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 select-none">
              <div>
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-zinc-900">
                  Trung Tâm Giám Sát Cổng IoT Gateway & Modbus RTU TCP/IP
                </h4>
                <p className="text-[10.5px] text-zinc-500 mt-1 font-medium">
                  Theo dõi thời gian thực dữ liệu nhận tín hiệu trực tiếp từ thiết bị cảm biến và đầu đọc thẻ RFID của bạn.
                </p>
              </div>
              <button
                onClick={() => setLogs([])}
                className="text-[9.5px] font-mono font-bold bg-white text-zinc-700 hover:text-zinc-950 border border-zinc-200 px-3 py-1.5 rounded-lg transition hover:bg-zinc-50 uppercase cursor-pointer"
              >
                Dọn Sạch Lịch Sử Nhật Ký
              </button>
            </div>

            <ControlPanel
              gates={gates}
              logs={logs}
              onManualGateOverride={handleManualGateOverride}
              onResetSimulation={handleResetSimulation}
              onClearLogs={() => setLogs([])}
            />
          </div>

        </main>
      ) : (
        // ==========================================
        // 🌐 WORKSPACE 2: CLIENT PORTAL HOMEPAGE (BẢN DÀNH CHO KHÁCH HÀNG)
        // ==========================================
        <>
          {/* 2. HERO HEADER SECTION WITH EXQUISITE 3D PARALLAX TILT TASTE-SKILL OBJECTS */}
          <section id="about" className="relative px-6 pt-16 pb-20 md:pt-24 md:pb-28 border-b border-zinc-200/45 select-none overflow-hidden bg-gradient-to-b from-white via-zinc-50/20 to-white">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
              
              {/* Left Hero Core Message */}
              <div className="lg:col-span-7 flex flex-col items-start text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#15803d]/5 border border-[#15803d]/15 text-[#15803d] text-[10px] font-mono font-bold uppercase tracking-widest mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#15803d] animate-pulse" />
                  BÃI ĐỖ XE DIGITAL TWIN HIỆN ĐẠI
                </div>

                <h2 className="text-4xl md:text-6xl font-display font-extrabold text-[#111827] tracking-tight leading-[1.1] mb-6">
                  Bản Đồ Thời Gian Thực <span className="text-[#0d9488] font-light italic font-serif">Dẹp Tan Nỗi Lo</span> Đỗ Xe
                </h2>

                <p className="text-xs md:text-sm text-zinc-650 max-w-xl leading-relaxed mb-8 font-medium">
                  Không còn lo mất thời gian tìm kiếm chỗ hay xếp hàng phiền hà. Hệ thống hiển thị bản đồ trực tuyến 3D cập nhật từng mili-giây giúp bạn đỗ xe (SUV, Sedan) vô cùng an toàn, thuận tiện, và mượt mà nhất.
                </p>

                <div className="flex flex-wrap gap-4 mb-8">
                  <a 
                    href="#digital-twin" 
                    className="px-6 py-3 bg-zinc-900 text-white font-display text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-800 transition shadow-md"
                  >
                    Trải Nghiệm Bản Đồ 3D
                  </a>
                  <a 
                    href="#features" 
                    className="px-6 py-3 border border-zinc-200 bg-white text-zinc-800 font-display text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-zinc-100 transition"
                  >
                    Tính Năng Vận Hành
                  </a>
                </div>

                {/* Micro details stats specifications */}
                <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-zinc-200/60 w-full text-[10px] font-mono text-zinc-400 font-bold">
                  <div>
                    <span className="text-zinc-350 block text-[8px] uppercase tracking-wider mb-0.5">MODBUS PROTOCOL</span>
                    <span className="text-zinc-700">RTU OVER TCP/IP</span>
                  </div>
                  <div className="w-[1px] h-6 bg-zinc-200" />
                  <div>
                    <span className="text-zinc-350 block text-[8px] uppercase tracking-wider mb-0.5">SENSORS SYSTEM</span>
                    <span className="text-zinc-700">&lt; 42MS TIMELAG</span>
                  </div>
                  <div className="w-[1px] h-6 bg-zinc-200" />
                  <div>
                    <span className="text-zinc-350 block text-[8px] uppercase tracking-wider mb-0.5">AI CORE ANPR</span>
                    <span className="text-zinc-700">VERSION v3.4</span>
                  </div>
                </div>
              </div>

              {/* Right Hero Interactive 3D Slanted Floating Objects (Taste-Skill style - High density, premium interlocking) */}
              <div className="lg:col-span-5 relative w-full h-[450px] md:h-[500px] flex items-center justify-center mt-8 lg:mt-0 select-none">
                {/* Ambient Background Glow matching the taste-skill physical look */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-gradient-to-tr from-[#0284c7]/5 to-zinc-400/5 blur-3xl -z-10" />

                {/* Background connecting modular dashed wires (System Line Matrix) */}
                <svg className="absolute inset-0 w-full h-full opacity-40 -z-10 pointer-events-none" style={{ minHeight: '100%' }}>
                  <line x1="32%" y1="18%" x2="78%" y2="24%" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="32%" y1="18%" x2="22%" y2="52%" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="22%" y1="52%" x2="55%" y2="52%" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="55%" y1="52%" x2="78%" y2="24%" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="55%" y1="52%" x2="72%" y2="82%" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="22%" y1="52%" x2="33%" y2="72%" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="33%" y1="72%" x2="72%" y2="82%" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="4 4" />
                </svg>

                {/* Object 1: Tesla Model S */}
                <div className="absolute top-[-5%] left-[2%] w-[165px] md:w-[195px] z-20">
                  <InteractiveCarCard
                    name="Tesla Model S"
                    type="sedan"
                    color="#0ea5e9"
                    batteryLevel={94}
                    isCharging={true}
                    statusText="Đang Sạc"
                    specs={[
                      { label: "LOẠI XE", value: "SEDAN BẠC ĐIỆN" },
                      { label: "SIÊU SẠC", value: "250 kW DC" }
                    ]}
                    initialYaw={35}
                  />
                </div>

                {/* Object 2: Porsche Taycan GT */}
                <div className="absolute top-0 right-0 w-[165px] md:w-[195px] z-10">
                  <InteractiveCarCard
                    name="Taycan Turbo"
                    type="sports"
                    color="#f43f5e"
                    batteryLevel={88}
                    isCharging={false}
                    statusText="Sẵn Sàng"
                    specs={[
                      { label: "LOẠI XE", value: "SIÊU THỂ THAO" },
                      { label: "TRẠM CHỜ", value: "BÃI A-02" }
                    ]}
                    initialYaw={125}
                  />
                </div>

                {/* Object 3: VinFast VF8 */}
                <div className="absolute top-[31%] left-[1%] w-[165px] md:w-[195px] z-40">
                  <InteractiveCarCard
                    name="VinFast VF8"
                    type="suv"
                    color="#eab308"
                    batteryLevel={76}
                    isCharging={true}
                    statusText="Hoạt Động"
                    specs={[
                      { label: "PHÂN KHÚC", value: "SMART E-SUV" },
                      { label: "CÔNG NGHỆ", value: "ADASTECH V3" }
                    ]}
                    initialYaw={220}
                  />
                </div>

                {/* Object 4: Hyundai Ioniq 6 */}
                <div className="absolute top-[36%] right-[1%] w-[165px] md:w-[195px] z-30">
                  <InteractiveCarCard
                    name="Ioniq 6 Coupe"
                    type="sedan"
                    color="#0f766e"
                    batteryLevel={91}
                    isCharging={false}
                    statusText="An Toàn"
                    specs={[
                      { label: "THIẾT KẾ", value: "AERODYNAMIC" },
                      { label: "ĐỘNG CƠ", value: "Dual-Motor" }
                    ]}
                    initialYaw={310}
                  />
                </div>

                {/* Object 5: Audi e-tron GT */}
                <div className="absolute bottom-[-5%] left-[4%] w-[165px] md:w-[195px] z-50">
                  <InteractiveCarCard
                    name="Audi e-tron GT"
                    type="sports"
                    color="#a855f7"
                    batteryLevel={64}
                    isCharging={true}
                    statusText="Sạc DC"
                    specs={[
                      { label: "DÒNG XE", value: "LUXURY TOURER" },
                      { label: "CÁP SẠC", value: "HỆ CHỦ ĐỘNG" }
                    ]}
                    initialYaw={75}
                  />
                </div>

                {/* Object 6: Wuling Air EV Mini */}
                <div className="absolute bottom-[2%] right-[4%] w-[165px] md:w-[195px] z-50">
                  <InteractiveCarCard
                    name="Wuling Air EV"
                    type="compact"
                    color="#f4f4f5"
                    batteryLevel={100}
                    isCharging={false}
                    statusText="Sẵn Sàng"
                    specs={[
                      { label: "LOẠI XE", value: "CITY COMPACT" },
                      { label: "BÁN KÍNH", value: "QUAY ĐẦU 4.3M" }
                    ]}
                    initialYaw={165}
                  />
                </div>

              </div>
            </div>

            {/* Floating background decorative coordinates lines */}
            <div className="absolute top-[20%] left-5 opacity-10 font-mono text-[9px] text-zinc-400 select-none hidden xl:block">
              <div>GEOMETRIC_MATRIX_3D: ENABLED</div>
              <div>PROJECTION: ISOMETRIC ORTHOGONAL</div>
            </div>
            <div className="absolute top-[80%] right-5 opacity-10 font-mono text-[9px] text-zinc-400 select-none hidden xl:block text-right">
              <div>GEOMETRICS: GASOLINE CODES ONLY</div>
              <div>CRAFTED: HIGH FIDELITY</div>
            </div>
          </section>

          {/* 3. INTERACTIVE 3D TWIN EXPERIENCE HUB */}
          <section id="digital-twin" className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            
            <div className="text-center mb-12 select-none">
              <span className="text-[10px] tracking-[0.25em] text-[#0d9488] uppercase font-bold block mb-3">
                TRỰC QUAN HÓA THỜI GIAN THỰC
              </span>
              <h3 className="text-2xl md:text-4xl font-display font-medium text-zinc-900 font-bold">
                Bản Đồ Bãi Đỗ Không Gian 3D Live
              </h3>
              <p className="text-xs md:text-sm text-zinc-550 mt-3 max-w-xl mx-auto leading-relaxed">
                Nhấp chọn trực tiếp từng ô đỗ xe trên mô hình 3D bên dưới để coi thông tin chi tiết từng phương tiện đang đỗ trong thời gian thực.
              </p>
            </div>

            {/* Telemetry Stats Banner */}
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 select-none">
              <div className="flex items-center gap-3 bg-[#0d9488]/5 py-1.5 px-4 rounded-full border border-[#0d9488]/15 text-[#0d9488]">
                <span className={`w-2 h-2 rounded-full ${
                  mqttStatus === 'connected' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500 animate-pulse'
                }`} />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
                  Hạ tầng truyền tin: {mqttStatus === 'connected' ? 'LIVE (CONNECTED)' : 'ĐANG ĐỒNG BỘ...'}
                </span>
              </div>
              <div className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-50 border border-zinc-200/50 px-3 py-1.5 rounded-lg">
                GIAO THỨC TRUYỀN TIN: <span className="text-zinc-650">MQTT SUBSCRIBED</span>
              </div>
            </div>

            {/* 3D Model with slots details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch min-h-[480px]">
              {/* Column 3D model */}
              <div className="lg:col-span-2 h-full flex flex-col">
                <IsometricView
                  slots={slots}
                  gates={gates}
                  selectedSlotId={selectedSlotId}
                  onSelectSlot={(id) => setSelectedSlotId(id)}
                />
              </div>

              {/* Column Details widget */}
              <div className="lg:col-span-1 h-full flex flex-col">
                <SlotDetails
                  slots={slots}
                  slot={slots.find((s) => s.id === selectedSlotId) || null}
                  onToggleEVCharging={handleToggleEVCharging}
                  onReleaseSlot={handleReleaseSlot}
                  onSelectSlot={(id) => setSelectedSlotId(id)}
                  isAdmin={false}
                />
              </div>
            </div>

          </section>

          {/* 4. PREMIUM COMPREHENSIVE FEATURES GRID */}
          <section id="features" className="bg-zinc-50 border-t border-b border-zinc-200/40 py-16 md:py-24 px-6">
            <div className="max-w-7xl mx-auto">
              
              <div className="text-center mb-16 select-none">
                <span className="text-[10px] tracking-[0.2em] text-[#15803d] uppercase font-bold block mb-3">
                  CÔNG NGHỆ CHẠM NGƯỠNG TƯƠNG LAI
                </span>
                <h3 className="text-2xl md:text-4xl font-display font-medium text-zinc-900 font-bold">
                  Tiện Ích Đỉnh Cao Khi Gửi Xe Tại TwinPark
                </h3>
                <p className="text-xs md:text-sm text-zinc-500 mt-3 max-w-lg mx-auto">
                  Sở hữu hạ tầng IoT hiện đại bậc nhất đem lại sự an tâm tuyệt đối và tiết kiệm thời gian tối đa.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                
                {/* Feature 1 */}
                <div className="bg-white border border-zinc-200/50 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-[#0ea5e9]/5 text-[#0ea5e9] flex items-center justify-center font-display font-bold text-sm mb-5">
                    🚗
                  </div>
                  <h4 className="font-display font-bold text-sm text-zinc-905 text-zinc-900 mb-2">Không Gian Đỗ Rộng Rãi</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-semibold">
                    Kích thước thiết kế ô đỗ chuẩn mực quốc tế, hỗ trợ đắc lực việc ra vào cho mọi dòng xe Sedan cỡ lớn, SUV gầm cao và xe địa hình chuyên dụng.
                  </p>
                </div>

                {/* Feature 2 */}
                <div className="bg-white border border-zinc-200/50 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-[#15803d]/5 text-[#15803d] flex items-center justify-center font-display font-bold text-sm mb-5">
                    💳
                  </div>
                  <h4 className="font-display font-bold text-sm text-zinc-900 mb-2">Soát Thẻ RFID Hợp Chuẩn</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-semibold">
                    Hệ thống tích hợp công nghệ thẻ từ RFID không tiếp xúc để tự động kích hoạt đóng mở barrier cổng ra vào một cách an toàn và bảo mật cao.
                  </p>
                </div>

                {/* Feature 3 */}
                <div className="bg-white border border-zinc-200/50 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/5 text-amber-600 flex items-center justify-center font-display font-bold text-sm mb-5">
                    📡
                  </div>
                  <h4 className="font-display font-bold text-sm text-zinc-900 mb-2">Cảm Biến Trục Siêu Âm</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-semibold">
                    Độ chính xác đo lường vật lý tuyệt đối từ cảm biến siêu âm song trục. Cập nhật ngay lập tức tình trạng chiếm chỗ lên bản đồ song sinh trực tuyến giúp bạn thấy chỗ trống tức thì.
                  </p>
                </div>

                {/* Feature 4 */}
                <div className="bg-white border border-zinc-200/50 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                  <div className="w-10 h-10 rounded-xl bg-emerald-700/5 text-emerald-700 flex items-center justify-center font-display font-bold text-sm mb-5">
                    🌱
                  </div>
                  <h4 className="font-display font-bold text-sm text-zinc-900 mb-2">Tối Ưu Thời Gian Gửi</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-semibold">
                    Hạn chế tối đa thời gian nổ máy di chuyển vô ích để tìm chỗ trống đỗ xe. Tiết kiệm lượng nhiên liệu tiêu hao và chi phí đỗ xe tích lũy phát sinh theo thời gian thực.
                  </p>
                </div>

              </div>

            </div>
          </section>

          {/* 5. FAQ SECTIONS */}
          <section id="faq" className="max-w-4xl mx-auto px-6 py-16 md:py-24 select-none">
            <div className="text-center mb-14">
              <span className="text-[10px] tracking-[0.2em] text-zinc-500 uppercase font-bold block mb-3">FAQ - GIẢI ĐÁP</span>
              <h3 className="text-2xl md:text-3xl font-display font-bold text-zinc-900 font-bold">Câu Hỏi Thường Gặp Của Khách Gửi Xe</h3>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-zinc-200/60 p-5 rounded-xl">
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-zinc-900 mb-2">Tôi có cần thẻ từ đỗ xe vật lý để ra vào không?</h4>
                <p className="text-xs text-zinc-550 leading-relaxed font-medium">
                  Có, hệ thống sử dụng thiết bị thẻ từ RFID an ninh. Khi quẹt thẻ từ hợp lệ, rào chắn barrier sẽ mở tự động trong chưa đầy 1 giây để ghi nhận và đóng hạ an toàn sau khi xe đi qua.
                </p>
              </div>

              <div className="bg-white border border-zinc-200/60 p-5 rounded-xl">
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-zinc-900 mb-2">Bãi đỗ này có trạm sạc điện cho xe hay không?</h4>
                <p className="text-xs text-zinc-550 leading-relaxed font-medium">
                  Không. Để đáp ứng bãi đỗ tập trung và an toàn cao, hạ tầng bãi đỗ của chúng tôi tập trung bố trí kỹ lưỡng các ô đỗ rộng mở và thông thoáng nhất.
                </p>
              </div>

              <div className="bg-white border border-zinc-200/60 p-5 rounded-xl">
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-zinc-900 mb-2">Bản đồ mô hình 3D có thực sự hiển thị đúng thực tế không?</h4>
                <p className="text-xs text-zinc-550 leading-relaxed font-medium">
                  Bản đồ 3D sử dụng công nghệ mô phỏng song sinh Digital Twin liên kết trực tiếp với cảm biến siêu âm song trục qua giao thức gửi nhận Modbus nên độ trễ đồng bộ hóa nhỏ hơn 42ms so với thực thế bên ngoài bãi đỗ.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* 6. FOOTER AND ATTRIBUTIONS */}
      <footer className="border-t border-zinc-200/80 bg-zinc-900 text-zinc-400 py-12 px-6 select-none">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded bg-[#0ea5e9]" />
              <span className="font-display font-black text-sm tracking-widest text-white">TWINPARK</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-500 font-bold">
              GIẢI PHÁP ĐỖ XE CAO CẤP DÀNH RIÊNG CHO ĐỘNG CƠ ĐỐT TRONG
            </p>
          </div>
          <div className="flex gap-8 text-[10px] font-mono font-bold text-zinc-550">
            <span>BẢN QUYỀN © 2026. ALL RIGHTS RESERVED.</span>
            <span className="hidden sm:inline">Hệ Thống Trích Xuất CAD SVG Matrix</span>
          </div>
        </div>
      </footer>

      {/* 7. AUTHENTICATION ACCESS MODAL FOR MANAGER */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-zinc-200 shadow-2xl rounded-2xl p-6 md:p-8 max-w-sm w-full text-left relative">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-zinc-455 text-zinc-400 hover:text-zinc-650 font-mono font-bold text-[10px] p-2 hover:bg-zinc-100 rounded-lg cursor-pointer"
            >
              ✕ ĐÓNG
            </button>

            <span className="text-[9px] tracking-[0.25em] text-[#0d9488] uppercase font-mono font-extrabold block mb-2">
              BÃI ĐỖ XE TWINPARK
            </span>
            <h4 className="font-display text-base font-black text-zinc-900 uppercase tracking-wider mb-2">
              Xác Thực Quản Trị Viên
            </h4>
            <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
              Vui lòng nhập mật khẩu PIN bảo mật của quản lý phía dưới để mở khóa bảng điều khoản mô phỏng và quản trị rào chắn.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (passwordInput === '1234') {
                  setIsManager(true);
                  setShowAuthModal(false);
                  setAuthError('');
                  addLog('parking', 'Đăng nhập thành công với vai trò Quản lý viên bãi xe.');
                } else {
                  setAuthError('Mã PIN sai hoặc không hợp lệ. Hãy thử lại!');
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">
                  Mã PIN Quản Lý
                </label>
                <input
                  type="password"
                  placeholder="Nhập 4 số PIN..."
                  maxLength={6}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 focus:border-[#0d9488] rounded-xl font-mono text-center tracking-[0.6em] text-lg bg-zinc-50 outline-none transition-all duration-200 focus:ring-1 focus:ring-[#0d9488]/30"
                  autoFocus
                />
              </div>

              {authError && (
                <p className="text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-200/50 p-2 rounded-lg text-center font-mono">
                  ⚠ {authError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-display font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-md"
              >
                XÁC NHẬN TRUY CẬP
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Simulated Vietnamese state automated registration generator
function generateVietnamesePlate(): string {
  const regions = ['29A', '30F', '51K', '43A', '15B', '75A', '37A', '36B'];
  const base = regions[Math.floor(Math.random() * regions.length)];
  const body = Math.floor(100 + Math.random() * 900); 
  const ext = Math.floor(10 + Math.random() * 90); 
  return `${base}-${body}.${ext}`;
}

// Selection of colors in tune with elegant luxurious templates
function getRandomCarColor(): string {
  const hexes = [
    '#ffffff', // alabaster white
    '#0ea5e9', // deep steel blue
    '#f43f5e', // crimson terracotta
    '#eab308', // gold chassis
    '#10b981', // dark cedar
    '#a855f7'  // graphite charcoal
  ];
  return hexes[Math.floor(Math.random() * hexes.length)];
}
