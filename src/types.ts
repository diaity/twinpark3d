/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SlotStatus = 'empty' | 'occupied' | 'reserved';

export interface Car {
  id: string;
  plateNumber: string;
  color: string; // Hex color or class name
  type: 'sedan' | 'suv' | 'ev' | 'truck';
  entryTime: Date;
  batteryLevel?: number; // Only for EV type
  temperature: number; // Simulated tire/battery temp
}

export interface ParkingSlot {
  id: number;
  label: string;
  status: SlotStatus;
  car: Car | null;
  isEVCharging: boolean;
  powerDraw?: number; // In kW, if EV charging
  sensorDistance: number; // distance from ceiling sensor (cm) - e.g. 50cm = full, 200cm = empty
  temperature: number; // celsius
}

export interface Gate {
  id: 'entrance' | 'exit';
  name: string;
  status: 'closed' | 'opening' | 'open' | 'closing' | 'scanner_active';
  lastPlate?: string;
  scannerLog: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'info' | 'scan' | 'gate' | 'parking' | 'warning';
  message: string;
}

export interface ParkingTelemetry {
  revenue: number;
  totalVehiclesEntered: number;
  totalVehiclesExited: number;
  averageStaySeconds: number;
}
