export type VolumeUnit = 'gal' | 'L';

export interface FuelSubmissionInput {
  vehicleId: number;
  date: string;
  odometer: number;
  volume: number;
  volumeUnit: VolumeUnit;
  cost: number;
  currency: string;
  isFillToFull: boolean;
  missedFuelup: boolean;
  notes?: string;
  tags?: string;
  manualFxRate?: number;
  clientSubmissionId: string;
}

export interface FuelSubmissionResult {
  ok: true;
  submitted: {
    gallons: number;
    cost: number;
    fxRate: number;
    fxSource: string;
    fxStale?: boolean;
  };
}
