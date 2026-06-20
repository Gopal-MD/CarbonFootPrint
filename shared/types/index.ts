export type TravelMode = 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING';

export type EmissionCategory = 'commute' | 'utility' | 'food' | 'other';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  monthlyGoalKg: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmissionMetadata {
  origin?: string;
  destination?: string;
  travelMode?: TravelMode;
  distanceKm?: number;
  kWh?: number;
  billProvider?: string;
  billPeriod?: string;
  confidence?: number;
}

export interface EmissionRecord {
  id?: string;
  userId: string;
  category: EmissionCategory;
  kgCO2e: number;
  date: string;
  createdAt?: string;  // Set server-side by Firestore
  updatedAt?: string;  // Set server-side by Firestore
  metadata?: EmissionMetadata;
}

export interface CommuteInput {
  origin: string;
  destination: string;
  travelMode: TravelMode;
  trips?: number;
  saveRecord?: boolean;
}

export interface CommuteResult {
  distanceKm: number;
  durationMinutes: number;
  kgCO2e: number;
  travelMode: TravelMode;
  originAddress: string;
  destinationAddress: string;
  savedId?: string;
}

export interface BillScanResult {
  kWhExtracted: number | null;
  kgCO2e: number;
  billProvider: string | null;
  billPeriod: string | null;
  confidence: number;
  rawSummary: string;
  cached: boolean;
}

export interface EcoInsightTip {
  title: string;
  description: string;
  category: EmissionCategory;
  estimatedSavingKg: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface EcoInsight {
  id: string;
  userId: string;
  prompt: string;
  responseText: string;
  tips: EcoInsightTip[];
  generatedAt: string;
  cached: boolean;
}

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

