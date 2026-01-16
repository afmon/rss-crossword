import { useState, useEffect } from 'react';
import { seikaApi, type SeikaConfig, type SeikaSpeaker, type AllSpeakerSettings } from '../services/api';

export function SettingsPage() {
  const [config, setConfig] = useState<SeikaConfig>({
    enabled: false,
    host: 'localhost',
    port: 7180,
    speakerId: -1,
    randomSpeaker: false,
    enabledSpeakers: [],
    username: '',
    password: '',
  });
  const [speakers, setSpeakers] = useState<SeikaSpeaker[]>([]);
  const [speakerSettings, setSpeakerSettings] = useState<AllSpeakerSettings>({});
  const [available, setAvailable] = useState<boolean | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [configResult, statusResult, settingsResult] = await Promise.all([
        seikaApi.getConfig(),
        seikaApi.getStatus(),
        seikaApi.getSpeakerSettings(),
      ]);
      setConfig(configResult.config);
      setAvailable(statusResult.available);
      setConnectionError(statusResult.error || null);
      setSpeakerSettings(settingsResult.settings);

      if (statusResult.available) {
        const speakersResult = await seikaApi.getSpeakers();
        setSpeakers(speakersResult.speakers);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      setMessage({ type: 'error', text: '設定の読み込みに失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const refreshSpeakers = async () => {
    try {
      const statusResult = await seikaApi.getStatus();
      setAvailable(statusResult.available);
      setConnectionError(statusResult.error || null);

      if (statusResult.available) {
        const speakersResult = await seikaApi.getSpeakers();
        setSpeakers(speakersResult.speakers);
        setMessage({ type: 'success', text: `${speakersResult.speakers.length}人の話者を取得しました` });
      } else {
        setSpeakers([]);
        const errorMsg = statusResult.error
          ? `AssistantSeikaに接続できません: ${statusResult.error}`
          : 'AssistantSeikaに接続できません';
        setMessage({ type: 'error', text: errorMsg });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '話者の取得に失敗しました' });
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await seikaApi.saveConfig(config);
      setConfig(result.config);
      setMessage({ type: 'success', text: '設定を保存しました' });
    } catch (error) {
      setMessage({ type: 'error', text: '設定の保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const testSpeak = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await seikaApi.testSpeak();
      if (result.success) {
        setMessage({ type: 'success', text: 'テスト音声を再生しました' });
      } else {
        setMessage({ type: 'error', text: '音声の再生に失敗しました' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '音声の再生に失敗しました' });
    } finally {
      setTesting(false);
    }
  };

  const updateSpeakerSetting = async (cid: number, field: 'volume' | 'speed', value: number | undefined) => {
    try {
      const currentSettings = speakerSettings[String(cid)] || {};
      const newSettings = { ...currentSettings, [field]: value };
      const result = await seikaApi.updateSpeakerSettings(cid, newSettings);
      setSpeakerSettings(result.settings);
    } catch (error) {
      console.error('Failed to update speaker setting:', error);
      setMessage({ type: 'error', text: '話者設定の更新に失敗しました' });
    }
  };

  if (loading) {
    return (
      <div className="settings-page">
        <div className="loading">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <h1>設定</h1>

      <section className="settings-section">
        <h2>AssistantSeika 連携</h2>
        <p className="section-description">
          音声合成ソフトを使って、新着記事のタイトルを自動で読み上げます。
        </p>

        <div className="settings-form">
          <div className="form-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              />
              <span>読み上げを有効にする</span>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>ホスト</label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="localhost"
              />
            </div>
            <div className="form-group">
              <label>ポート</label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) || 7180 })}
                placeholder="7180"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>ユーザー名</label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="省略可"
              />
            </div>
            <div className="form-group">
              <label>パスワード</label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="省略可"
              />
            </div>
          </div>

          <div className="form-group">
            <label>接続状態</label>
            <div className="connection-status">
              <span className={`status-indicator ${available ? 'connected' : 'disconnected'}`}>
                {available ? '接続済み' : '未接続'}
              </span>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={refreshSpeakers}
              >
                再確認
              </button>
            </div>
            {connectionError && (
              <p className="form-hint error-hint">
                エラー: {connectionError}
              </p>
            )}
          </div>

          <div className="form-group">
            <label>話者</label>
            <select
              value={config.speakerId}
              onChange={(e) => setConfig({ ...config, speakerId: parseInt(e.target.value, 10) })}
              disabled={speakers.length === 0 || config.randomSpeaker}
            >
              <option value={-1}>-- 選択してください --</option>
              {speakers.map((speaker) => (
                <option key={speaker.cid} value={speaker.cid}>
                  {speaker.name} ({speaker.prod})
                </option>
              ))}
            </select>
            {speakers.length === 0 && (
              <p className="form-hint">
                AssistantSeikaに接続して話者を取得してください
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={config.randomSpeaker}
                onChange={(e) => setConfig({ ...config, randomSpeaker: e.target.checked })}
                disabled={speakers.length === 0}
              />
              <span>ランダムに話者を選択</span>
            </label>
            <p className="form-hint">
              有効にすると、読み上げごとに話者をランダムに選択します
            </p>
          </div>

          {config.randomSpeaker && speakers.length > 0 && (
            <div className="form-group speaker-selection">
              <label>使用する話者</label>
              <div className="speaker-selection-actions">
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setConfig({ ...config, enabledSpeakers: speakers.map(s => s.cid) })}
                >
                  全選択
                </button>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setConfig({ ...config, enabledSpeakers: [] })}
                >
                  全解除
                </button>
              </div>
              <div className="speaker-list">
                {speakers.map((speaker) => (
                  <label key={speaker.cid} className="speaker-item">
                    <input
                      type="checkbox"
                      checked={config.enabledSpeakers.length === 0 || config.enabledSpeakers.includes(speaker.cid)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Add speaker
                          const newEnabled = config.enabledSpeakers.length === 0
                            ? speakers.filter(s => s.cid === speaker.cid || config.enabledSpeakers.includes(s.cid)).map(s => s.cid)
                            : [...config.enabledSpeakers, speaker.cid];
                          setConfig({ ...config, enabledSpeakers: newEnabled });
                        } else {
                          // Remove speaker - if enabledSpeakers is empty, it means all are enabled, so we need to populate it first
                          const currentEnabled = config.enabledSpeakers.length === 0
                            ? speakers.map(s => s.cid)
                            : config.enabledSpeakers;
                          setConfig({ ...config, enabledSpeakers: currentEnabled.filter(cid => cid !== speaker.cid) });
                        }
                      }}
                    />
                    <span className="speaker-name">{speaker.name}</span>
                    <span className="speaker-prod">({speaker.prod})</span>
                  </label>
                ))}
              </div>
              {config.enabledSpeakers.length === 0 && (
                <p className="form-hint">すべての話者が使用されます</p>
              )}
            </div>
          )}

          {speakers.length > 0 && (
            <div className="form-group speaker-settings-section">
              <label>話者ごとの音量・速度設定</label>
              <p className="form-hint">未設定の場合はソフト側のデフォルト値が使用されます</p>
              <div className="speaker-settings-list">
                {speakers.map((speaker) => {
                  const settings = speakerSettings[String(speaker.cid)] || {};
                  return (
                    <div key={speaker.cid} className="speaker-settings-item">
                      <div className="speaker-settings-header">
                        <span className="speaker-name">{speaker.name}</span>
                        <span className="speaker-prod">({speaker.prod})</span>
                      </div>
                      <div className="speaker-settings-controls">
                        <div className="setting-control">
                          <label>
                            音量:
                            <span className="setting-value">
                              {settings.volume !== undefined ? settings.volume.toFixed(1) : 'デフォルト'}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={settings.volume ?? 1.0}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              // Only set if different from default (1.0)
                              updateSpeakerSetting(speaker.cid, 'volume', value);
                            }}
                          />
                          {settings.volume !== undefined && (
                            <button
                              type="button"
                              className="btn-reset"
                              onClick={() => updateSpeakerSetting(speaker.cid, 'volume', undefined)}
                              title="デフォルトに戻す"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className="setting-control">
                          <label>
                            速度:
                            <span className="setting-value">
                              {settings.speed !== undefined ? settings.speed.toFixed(1) : 'デフォルト'}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.1"
                            value={settings.speed ?? 1.0}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              updateSpeakerSetting(speaker.cid, 'speed', value);
                            }}
                          />
                          {settings.speed !== undefined && (
                            <button
                              type="button"
                              className="btn-reset"
                              onClick={() => updateSpeakerSetting(speaker.cid, 'speed', undefined)}
                              title="デフォルトに戻す"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {message && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={saveConfig}
              disabled={saving}
            >
              {saving ? '保存中...' : '設定を保存'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={testSpeak}
              disabled={testing || (config.speakerId < 0 && !config.randomSpeaker)}
            >
              {testing ? '再生中...' : 'テスト再生'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
