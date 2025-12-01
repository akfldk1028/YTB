import http from "http";
import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import path from "path";
import { ShortCreator } from "../short-creator";
import { APIRouter } from "./routers/rest";
import { MCPRouter } from "./routers/mcp";
import { ImageRoutes } from "../image-generation/routes/imageRoutes";
import { PexelsAPIRouter } from "./api/pexels";
import { NanoBananaAPIRouter } from "./api/nano-banana";
import { VEO3APIRouter } from "./api/veo3";
import { ConsistentShortsAPIRouter } from "./api/consistent-shorts";
import { CharacterAPIRouter } from "./api/characters";
import { YouTubeRoutes } from "../youtube-upload/routes/youtubeRoutes";
import { YouTubeUploader } from "../youtube-upload/services/YouTubeUploader";
import { YouTubeAnalyticsService } from "../youtube-analytics/services/YouTubeAnalyticsService";
import { createAnalyticsRoutes } from "../youtube-analytics/routes/analyticsRoutes";
import { GoogleSheetsService } from "../sheet/services/GoogleSheetsService";
import { createSheetRoutes } from "../sheet/routes/sheetRoutes";
import { logger } from "../logger";
import { Config } from "../config";

export class Server {
  private app: express.Application;
  private config: Config;

  constructor(config: Config, shortCreator: ShortCreator, youtubeUploader?: YouTubeUploader) {
    this.config = config;
    this.app = express();

    // add healthcheck endpoint
    this.app.get("/health", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json({ status: "ok" });
    });

    const apiRouter = new APIRouter(config, shortCreator);
    const mcpRouter = new MCPRouter(shortCreator);
    const imageRoutes = new ImageRoutes(config);

    // Mode-specific API routers
    const pexelsAPIRouter = new PexelsAPIRouter(config, shortCreator);
    const nanoBananaAPIRouter = new NanoBananaAPIRouter(config, shortCreator);
    const veo3APIRouter = new VEO3APIRouter(config, shortCreator);
    const consistentShortsAPIRouter = new ConsistentShortsAPIRouter(config, shortCreator);

    this.app.use("/api", apiRouter.router);
    this.app.use("/mcp", mcpRouter.router);
    this.app.use("/api/images", imageRoutes.router);

    // Mount mode-specific API endpoints
    this.app.use("/api/video/pexels", pexelsAPIRouter.router);
    this.app.use("/api/video/nano-banana", nanoBananaAPIRouter.router);
    this.app.use("/api/video/veo3", veo3APIRouter.router);
    this.app.use("/api/video/consistent-shorts", consistentShortsAPIRouter.router);

    // Mount Character Storage API (for persistent characters across videos)
    const characterAPIRouter = new CharacterAPIRouter(config);
    this.app.use("/api/characters", characterAPIRouter.router);
    logger.info("Character Storage API mounted at /api/characters");

    // Mount YouTube upload routes if uploader is available
    if (youtubeUploader) {
      const youtubeRoutes = new YouTubeRoutes(config, youtubeUploader);
      this.app.use("/api/youtube", youtubeRoutes.router);
      logger.info("YouTube upload routes mounted at /api/youtube");

      // Mount YouTube Analytics routes
      let analyticsService: YouTubeAnalyticsService | undefined;
      try {
        analyticsService = new YouTubeAnalyticsService(config);
        const analyticsRoutes = createAnalyticsRoutes(analyticsService);
        this.app.use("/api/analytics", analyticsRoutes);
        logger.info("YouTube Analytics routes mounted at /api/analytics");
      } catch (error) {
        logger.warn({ error }, "YouTube Analytics service not initialized");
      }

      // Mount Google Sheets routes (for video metadata logging)
      try {
        const sheetsService = new GoogleSheetsService(config);
        const sheetRoutes = createSheetRoutes(sheetsService, analyticsService);
        this.app.use("/api/sheet", sheetRoutes);
        if (sheetsService.isConfigured()) {
          logger.info("Google Sheets routes mounted at /api/sheet");
        } else {
          logger.warn("Google Sheets not configured (GOOGLE_SHEETS_SPREADSHEET_ID not set)");
        }
      } catch (error) {
        logger.warn({ error }, "Google Sheets service not initialized");
      }
    } else {
      logger.warn("YouTube uploader not available - upload routes not mounted");
    }

    // Serve static files from the UI build
    this.app.use(express.static(path.join(__dirname, "../../dist/ui")));
    this.app.use(
      "/static",
      express.static(path.join(__dirname, "../../static")),
    );

    // Serve the React app for all other routes (must be last)
    this.app.get("*", (req: ExpressRequest, res: ExpressResponse) => {
      res.sendFile(path.join(__dirname, "../../dist/ui/index.html"));
    });
  }

  public start(): http.Server {
    const server = this.app.listen(this.config.port, "0.0.0.0", () => {
      logger.info(
        { port: this.config.port, mcp: "/mcp", api: "/api", host: "0.0.0.0" },
        "MCP and API server is running",
      );
      logger.info(
        `UI server is running on http://0.0.0.0:${this.config.port}`,
      );
    });

    server.on("error", (error: Error) => {
      logger.error(error, "Error starting server");
    });

    return server;
  }

  public getApp() {
    return this.app;
  }
}
