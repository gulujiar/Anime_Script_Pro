
export type ProviderType = 'google' | 'volcengine' | 'grsai';

export interface ApiConfig {
  provider: ProviderType;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export interface UploadedImage {
  id: string;
  name: string;
  base64: string;
  type: string;
}

export interface AnimeShot {
  globalStyle?: string;
  duration: string;
  cameraMovement: string;
  description: string;
  action: string;
  positioning: string;
  lighting: string;
  fx: string;
  sfx: string;
  music: string;
  dialogue?: string;
}

export interface HistoryItem {
  id: string;
  input: string;
  script: AnimeShot[];
  uploadedImages?: UploadedImage[];
  timestamp: number;
}
