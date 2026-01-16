import { Router, Request, Response } from 'express';
import * as seikaService from '../services/seikaService';

const router = Router();

/**
 * GET /api/seika/speakers
 * Get available speakers from AssistantSeika
 */
router.get('/speakers', async (_req: Request, res: Response) => {
  try {
    const speakers = await seikaService.getSpeakers();
    res.json({ success: true, speakers });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/seika/status
 * Check if AssistantSeika is available
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const result = await seikaService.isAvailable();
    res.json({ success: true, available: result.available, error: result.error });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/seika/config
 * Get current Seika configuration
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = seikaService.getConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/seika/config
 * Update Seika configuration
 */
router.post('/config', (req: Request, res: Response) => {
  try {
    const { enabled, host, port, speakerId, randomSpeaker, enabledSpeakers, username, password } = req.body;
    seikaService.saveConfig({ enabled, host, port, speakerId, randomSpeaker, enabledSpeakers, username, password });
    const config = seikaService.getConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/seika/test
 * Test speech with AssistantSeika
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    const testText = text || 'これはテスト音声です。AssistantSeikaと正常に接続されています。';
    const result = await seikaService.testSpeak(testText);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/seika/speaker-settings
 * Get all speaker settings (volume/speed per speaker)
 */
router.get('/speaker-settings', (_req: Request, res: Response) => {
  try {
    const settings = seikaService.getSpeakerSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

/**
 * PUT /api/seika/speaker-settings/:cid
 * Update settings for a specific speaker
 */
router.put('/speaker-settings/:cid', (req: Request, res: Response) => {
  try {
    const cid = parseInt(req.params.cid, 10);
    if (isNaN(cid)) {
      res.status(400).json({
        success: false,
        error: 'Invalid speaker ID'
      });
      return;
    }

    const { volume, speed } = req.body;
    seikaService.saveSpeakerSetting(cid, { volume, speed });
    const settings = seikaService.getSpeakerSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
});

export default router;
