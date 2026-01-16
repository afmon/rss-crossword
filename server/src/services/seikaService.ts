import axios from 'axios';
import { getDatabase } from './database';

export interface Speaker {
  cid: number;
  name: string;
  prod: string;
}

export interface SeikaConfig {
  enabled: boolean;
  host: string;
  port: number;
  speakerId: number;
  randomSpeaker: boolean;
  enabledSpeakers: number[];
  username: string;
  password: string;
}

export interface SpeakerSettings {
  volume?: number;  // 0.0 - 2.0, undefined = use default
  speed?: number;   // 0.5 - 2.0, undefined = use default
}

export type AllSpeakerSettings = Record<string, SpeakerSettings>;

const DEFAULT_CONFIG: SeikaConfig = {
  enabled: false,
  host: 'localhost',
  port: 7180,
  speakerId: -1,
  randomSpeaker: false,
  enabledSpeakers: [],
  username: '',
  password: '',
};

/**
 * Get Seika configuration from database
 */
export function getConfig(): SeikaConfig {
  const db = getDatabase();

  const getSettingValue = (key: string, defaultValue: string): string => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? defaultValue;
  };

  const enabledSpeakersStr = getSettingValue('seika_enabled_speakers', '[]');
  let enabledSpeakers: number[] = [];
  try {
    enabledSpeakers = JSON.parse(enabledSpeakersStr);
  } catch {
    enabledSpeakers = [];
  }

  return {
    enabled: getSettingValue('seika_enabled', 'false') === 'true',
    host: getSettingValue('seika_host', DEFAULT_CONFIG.host),
    port: parseInt(getSettingValue('seika_port', String(DEFAULT_CONFIG.port)), 10),
    speakerId: parseInt(getSettingValue('seika_speaker_id', '-1'), 10),
    randomSpeaker: getSettingValue('seika_random_speaker', 'false') === 'true',
    enabledSpeakers,
    username: getSettingValue('seika_username', ''),
    password: getSettingValue('seika_password', ''),
  };
}

/**
 * Save Seika configuration to database
 */
export function saveConfig(config: Partial<SeikaConfig>): void {
  const db = getDatabase();

  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  if (config.enabled !== undefined) {
    upsert.run('seika_enabled', String(config.enabled));
  }
  if (config.host !== undefined) {
    upsert.run('seika_host', config.host);
  }
  if (config.port !== undefined) {
    upsert.run('seika_port', String(config.port));
  }
  if (config.speakerId !== undefined) {
    upsert.run('seika_speaker_id', String(config.speakerId));
  }
  if (config.randomSpeaker !== undefined) {
    upsert.run('seika_random_speaker', String(config.randomSpeaker));
  }
  if (config.enabledSpeakers !== undefined) {
    upsert.run('seika_enabled_speakers', JSON.stringify(config.enabledSpeakers));
  }
  if (config.username !== undefined) {
    upsert.run('seika_username', config.username);
  }
  if (config.password !== undefined) {
    upsert.run('seika_password', config.password);
  }
}

/**
 * Get all speaker settings from database
 */
export function getSpeakerSettings(): AllSpeakerSettings {
  const db = getDatabase();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('seika_speaker_settings') as { value: string } | undefined;

  if (!row?.value) {
    return {};
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return {};
  }
}

/**
 * Save speaker setting for a specific speaker
 */
export function saveSpeakerSetting(cid: number, settings: SpeakerSettings): void {
  const db = getDatabase();
  const allSettings = getSpeakerSettings();

  // Remove undefined values and empty settings
  const cleanSettings: SpeakerSettings = {};
  if (settings.volume !== undefined && settings.volume !== null) {
    cleanSettings.volume = settings.volume;
  }
  if (settings.speed !== undefined && settings.speed !== null) {
    cleanSettings.speed = settings.speed;
  }

  // If settings are empty, remove the speaker entry
  if (Object.keys(cleanSettings).length === 0) {
    delete allSettings[String(cid)];
  } else {
    allSettings[String(cid)] = cleanSettings;
  }

  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  upsert.run('seika_speaker_settings', JSON.stringify(allSettings));
}

/**
 * Get base URL for AssistantSeika API
 */
function getBaseUrl(): string {
  const config = getConfig();
  return `http://${config.host}:${config.port}`;
}

/**
 * Get axios config with optional Basic Auth
 */
function getAxiosConfig(timeout: number = 5000): { timeout: number; auth?: { username: string; password: string } } {
  const config = getConfig();
  const axiosConfig: { timeout: number; auth?: { username: string; password: string } } = { timeout };

  if (config.username && config.password) {
    axiosConfig.auth = {
      username: config.username,
      password: config.password,
    };
  }

  return axiosConfig;
}

/**
 * Get available speakers from AssistantSeika
 */
export async function getSpeakers(): Promise<Speaker[]> {
  try {
    const response = await axios.get(`${getBaseUrl()}/AVATOR2`, getAxiosConfig(5000));
    const data = response.data;

    // Response is an array of speaker objects
    const speakers: Speaker[] = data.map((item: { cid: number; name: string; prod: string }) => ({
      cid: item.cid,
      name: item.name,
      prod: item.prod,
    }));

    return speakers.sort((a, b) => a.cid - b.cid);
  } catch (error) {
    console.error('[Seika] Failed to get speakers:', (error as Error).message);
    return [];
  }
}

/**
 * Check if AssistantSeika is available
 */
export async function isAvailable(): Promise<{ available: boolean; error?: string }> {
  const url = `${getBaseUrl()}/AVATOR2`;

  try {
    await axios.get(url, getAxiosConfig(3000));
    return { available: true };
  } catch (error: any) {
    const message = error.response
      ? `HTTP ${error.response.status}: ${error.response.statusText}`
      : error.message;
    console.error('[Seika] Connection failed:', message);
    return { available: false, error: message };
  }
}

/**
 * Speak text using AssistantSeika (internal, skips enabled check)
 */
async function speakInternal(text: string, speakerId: number): Promise<boolean> {
  const url = `${getBaseUrl()}/PLAY2/${speakerId}`;

  // Build request body with optional effects
  const body: { talktext: string; effects?: { volume?: number; speed?: number } } = {
    talktext: text,
  };

  // Get speaker-specific settings
  const speakerSettings = getSpeakerSettings();
  const settings = speakerSettings[String(speakerId)];

  if (settings && (settings.volume !== undefined || settings.speed !== undefined)) {
    body.effects = {};
    if (settings.volume !== undefined) {
      body.effects.volume = settings.volume;
    }
    if (settings.speed !== undefined) {
      body.effects.speed = settings.speed;
    }
  }

  try {
    // AssistantSeika PLAY2 API
    // POST /PLAY2/{cid} with body { talktext: "text", effects?: { volume, speed } }
    const axiosConfig = getAxiosConfig(30000);
    await axios.post(url, body, {
      ...axiosConfig,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return true;
  } catch (error: any) {
    console.error('[Seika] Failed to speak:', error.message);
    if (error.response) {
      console.error('[Seika] Response status:', error.response.status);
      console.error('[Seika] Response data:', error.response.data);
    }
    return false;
  }
}

/**
 * Speak text using AssistantSeika (checks enabled flag)
 */
export async function speak(text: string): Promise<boolean> {
  const config = getConfig();

  if (!config.enabled) {
    return false;
  }

  let speakerId = config.speakerId;

  // Random speaker mode
  if (config.randomSpeaker) {
    let speakers = await getSpeakers();
    // Filter by enabled speakers if set
    if (config.enabledSpeakers.length > 0) {
      speakers = speakers.filter(s => config.enabledSpeakers.includes(s.cid));
    }
    if (speakers.length === 0) {
      return false;
    }
    const randomIndex = Math.floor(Math.random() * speakers.length);
    speakerId = speakers[randomIndex].cid;
  } else if (speakerId < 0) {
    return false;
  }

  return speakInternal(text, speakerId);
}

/**
 * Test speak - bypasses enabled check, supports random speaker
 */
export async function testSpeak(text: string): Promise<boolean> {
  const config = getConfig();

  let speakerId = config.speakerId;

  // Random speaker mode
  if (config.randomSpeaker) {
    let speakers = await getSpeakers();
    // Filter by enabled speakers if set
    if (config.enabledSpeakers.length > 0) {
      speakers = speakers.filter(s => config.enabledSpeakers.includes(s.cid));
    }
    if (speakers.length === 0) {
      return false;
    }
    const randomIndex = Math.floor(Math.random() * speakers.length);
    speakerId = speakers[randomIndex].cid;
  } else if (speakerId < 0) {
    return false;
  }

  return speakInternal(text, speakerId);
}

/**
 * Queue of texts to speak (to avoid overlapping)
 */
const speakQueue: string[] = [];
let isSpeaking = false;

async function processQueue(): Promise<void> {
  if (isSpeaking || speakQueue.length === 0) {
    return;
  }

  isSpeaking = true;

  while (speakQueue.length > 0) {
    const text = speakQueue.shift();
    if (text) {
      await speak(text);
      // Small delay between speeches
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  isSpeaking = false;
}

/**
 * Queue text to speak (non-blocking)
 */
export function queueSpeak(text: string): void {
  const config = getConfig();
  if (!config.enabled) {
    return;
  }

  speakQueue.push(text);
  processQueue();
}
