/**
 * Character Storage API Router
 *
 * REST API endpoints for managing character profiles and characters.
 * Used for maintaining consistent characters across multiple video generations.
 *
 * Routes:
 * - POST   /api/characters/profiles         - Create new profile
 * - GET    /api/characters/profiles         - List all profiles
 * - GET    /api/characters/profiles/:id     - Get profile by ID
 * - PUT    /api/characters/profiles/:id     - Update profile
 * - DELETE /api/characters/profiles/:id     - Delete profile
 *
 * - POST   /api/characters/profiles/:id/characters        - Add character to profile
 * - PUT    /api/characters/profiles/:id/characters/:cid   - Update character
 * - DELETE /api/characters/profiles/:id/characters/:cid   - Delete character
 *
 * - GET    /api/characters/profiles/:id/characters/:cid/image - Get character image URL
 * - GET    /api/characters/profiles/:id/images                - Load all character images
 */

import express from 'express';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { CharacterStorageService } from '../../character-store/CharacterStorageService';
import { logger } from '../../logger';
import { Config } from '../../config';
import type {
  CreateProfileRequest,
  UpdateProfileRequest,
  AddCharacterRequest,
  UpdateCharacterRequest,
} from '../../character-store/types';

export class CharacterAPIRouter {
  public router: express.Router;
  private characterStorage: CharacterStorageService;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.router = express.Router();
    this.characterStorage = new CharacterStorageService(config);

    this.router.use(express.json({ limit: '50mb' })); // Large limit for base64 images
    this.setupRoutes();
  }

  /**
   * Get the CharacterStorageService instance
   * (for use by other services like ConsistentShortsWorkflow)
   */
  getStorageService(): CharacterStorageService {
    return this.characterStorage;
  }

  private setupRoutes() {
    // ============ Profile Routes ============

    /**
     * POST /api/characters/profiles
     * Create a new character profile
     */
    this.router.post('/profiles', async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const request: CreateProfileRequest = req.body;

        if (!request.profileId || !request.name) {
          res.status(400).json({
            success: false,
            error: 'profileId and name are required',
          });
          return;
        }

        if (!request.characters || request.characters.length === 0) {
          res.status(400).json({
            success: false,
            error: 'At least one character is required',
          });
          return;
        }

        const result = await this.characterStorage.createProfile(request);

        if (result.success) {
          logger.info({ profileId: request.profileId }, 'Character profile created via API');
          res.status(201).json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ error }, 'Error creating profile');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    /**
     * GET /api/characters/profiles
     * List all profiles
     */
    this.router.get('/profiles', async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const result = await this.characterStorage.listProfiles();

        if (result.success) {
          res.json(result);
        } else {
          res.status(500).json(result);
        }
      } catch (error) {
        logger.error({ error }, 'Error listing profiles');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    /**
     * GET /api/characters/profiles/:profileId
     * Get a specific profile
     */
    this.router.get('/profiles/:profileId', async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { profileId } = req.params;
        const result = await this.characterStorage.getProfile(profileId);

        if (result.success) {
          res.json(result);
        } else {
          res.status(404).json(result);
        }
      } catch (error) {
        logger.error({ error }, 'Error getting profile');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    /**
     * PUT /api/characters/profiles/:profileId
     * Update a profile
     */
    this.router.put('/profiles/:profileId', async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { profileId } = req.params;
        const request: UpdateProfileRequest = req.body;

        const result = await this.characterStorage.updateProfile(profileId, request);

        if (result.success) {
          logger.info({ profileId }, 'Character profile updated via API');
          res.json(result);
        } else {
          res.status(404).json(result);
        }
      } catch (error) {
        logger.error({ error }, 'Error updating profile');
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    /**
     * DELETE /api/characters/profiles/:profileId
     * Delete a profile and all its characters
     */
    this.router.delete(
      '/profiles/:profileId',
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { profileId } = req.params;
          const result = await this.characterStorage.deleteProfile(profileId);

          if (result.success) {
            logger.info({ profileId }, 'Character profile deleted via API');
            res.json(result);
          } else {
            res.status(404).json(result);
          }
        } catch (error) {
          logger.error({ error }, 'Error deleting profile');
          res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    // ============ Character Routes ============

    /**
     * POST /api/characters/profiles/:profileId/characters
     * Add a character to a profile
     */
    this.router.post(
      '/profiles/:profileId/characters',
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { profileId } = req.params;
          const request: AddCharacterRequest = req.body;

          if (!request.id || !request.name || !request.description) {
            res.status(400).json({
              success: false,
              error: 'id, name, and description are required',
            });
            return;
          }

          const result = await this.characterStorage.addCharacter(profileId, request);

          if (result.success) {
            logger.info({ profileId, characterId: request.id }, 'Character added via API');
            res.status(201).json(result);
          } else {
            res.status(400).json(result);
          }
        } catch (error) {
          logger.error({ error }, 'Error adding character');
          res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    /**
     * PUT /api/characters/profiles/:profileId/characters/:characterId
     * Update a character
     */
    this.router.put(
      '/profiles/:profileId/characters/:characterId',
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { profileId, characterId } = req.params;
          const request: UpdateCharacterRequest = req.body;

          const result = await this.characterStorage.updateCharacter(profileId, characterId, request);

          if (result.success) {
            logger.info({ profileId, characterId }, 'Character updated via API');
            res.json(result);
          } else {
            res.status(404).json(result);
          }
        } catch (error) {
          logger.error({ error }, 'Error updating character');
          res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    /**
     * DELETE /api/characters/profiles/:profileId/characters/:characterId
     * Delete a character from a profile
     */
    this.router.delete(
      '/profiles/:profileId/characters/:characterId',
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { profileId, characterId } = req.params;
          const result = await this.characterStorage.deleteCharacter(profileId, characterId);

          if (result.success) {
            logger.info({ profileId, characterId }, 'Character deleted via API');
            res.json(result);
          } else {
            res.status(404).json(result);
          }
        } catch (error) {
          logger.error({ error }, 'Error deleting character');
          res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    // ============ Image Routes ============

    /**
     * GET /api/characters/profiles/:profileId/characters/:characterId/image
     * Get signed URL for character's reference image
     */
    this.router.get(
      '/profiles/:profileId/characters/:characterId/image',
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { profileId, characterId } = req.params;
          const expiresIn = parseInt(req.query.expiresIn as string) || 60;

          const result = await this.characterStorage.getCharacterImageUrl(
            profileId,
            characterId,
            expiresIn
          );

          if (result.success) {
            res.json(result);
          } else {
            res.status(404).json(result);
          }
        } catch (error) {
          logger.error({ error }, 'Error getting character image URL');
          res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    /**
     * GET /api/characters/profiles/:profileId/images
     * Load all character images as base64
     * (For use by ConsistentShortsWorkflow)
     */
    this.router.get(
      '/profiles/:profileId/images',
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { profileId } = req.params;
          const result = await this.characterStorage.loadCharacterImages(profileId);

          if (result.success && result.data) {
            // Convert Map to object for JSON serialization
            const imagesObject: Record<string, string> = {};
            result.data.forEach((value, key) => {
              imagesObject[key] = value;
            });

            res.json({
              success: true,
              data: {
                profileId,
                images: imagesObject,
                count: result.data.size,
              },
            });
          } else {
            res.status(404).json(result);
          }
        } catch (error) {
          logger.error({ error }, 'Error loading character images');
          res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    // ============ Health Check ============

    /**
     * GET /api/characters/health
     * Check if character storage is enabled and working
     */
    this.router.get('/health', (req: ExpressRequest, res: ExpressResponse) => {
      const isEnabled = this.characterStorage.isEnabled();
      res.json({
        success: true,
        enabled: isEnabled,
        message: isEnabled
          ? 'Character storage is enabled and ready'
          : 'Character storage is disabled (GCS_BUCKET_NAME not configured)',
      });
    });
  }
}
