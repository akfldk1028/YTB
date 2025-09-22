import { ImagenService } from "../services/ImagenService";
import { saveImageToFile, generateImageFilename, createImageGalleryHtml, imageToDataUri } from "../utils/imageUtils";
import { ImageGenerationQuery } from "../types/imagen";
import { logger } from "../../config";
import path from "path";

/**
 * Test Google Imagen API functionality
 */
export class ImagenTester {
  private imagenService: ImagenService;
  private outputDir: string;

  constructor(apiKey: string, outputDir: string) {
    if (!apiKey) {
      throw new Error("API key is required for ImagenTester");
    }
    this.imagenService = new ImagenService(apiKey);
    this.outputDir = outputDir;
  }

  /**
   * Run basic connection test
   */
  async testConnection(): Promise<void> {
    logger.info("Testing Imagen API connection...");
    
    const result = await this.imagenService.testConnection();
    
    if (result.success) {
      logger.info("✅ Imagen API connection successful!");
    } else {
      logger.error({ error: result.error }, "❌ Imagen API connection failed");
      throw new Error(`Connection test failed: ${result.error}`);
    }
  }

  /**
   * Test AR glasses themed image generation
   */
  async testARGlassesGeneration(): Promise<string[]> {
    logger.info("Testing AR glasses image generation...");

    const queries: ImageGenerationQuery[] = [
      {
        prompt: "A futuristic pair of AR glasses with holographic displays, sleek modern design, transparent lenses showing digital overlays, high-tech aesthetic, studio lighting",
        numberOfImages: 2,
        aspectRatio: "16:9",
        size: "1K",
      },
      {
        prompt: "Person wearing AR smart glasses in a modern office, digital interface floating in front of their eyes, professional setting, realistic photo style",
        numberOfImages: 2,
        aspectRatio: "9:16",
        allowPeople: true,
      },
    ];

    const savedFiles: string[] = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      logger.info(`Generating images for query ${i + 1}...`);

      const result = await this.imagenService.generateImages(query);

      if (!result.success) {
        logger.error({ error: result.error }, `Query ${i + 1} failed`);
        continue;
      }

      if (result.images) {
        for (const image of result.images) {
          const filePath = await saveImageToFile(
            image.data,
            image.filename,
            this.outputDir
          );
          savedFiles.push(filePath);
          logger.info(`✅ Saved: ${filePath}`);
        }
      }
    }

    return savedFiles;
  }

  /**
   * Test various image generation parameters
   */
  async testParameterVariations(): Promise<string[]> {
    logger.info("Testing parameter variations...");

    const basePrompt = "A stylish pair of augmented reality glasses";
    const variations: ImageGenerationQuery[] = [
      {
        prompt: basePrompt,
        numberOfImages: 1,
        aspectRatio: "1:1",
        size: "1K",
      },
      {
        prompt: basePrompt,
        numberOfImages: 1,
        aspectRatio: "16:9",
        size: "2K",
      },
      {
        prompt: basePrompt + ", minimalist design, white background",
        numberOfImages: 1,
        aspectRatio: "3:4",
      },
    ];

    const savedFiles: string[] = [];

    for (let i = 0; i < variations.length; i++) {
      const query = variations[i];
      logger.info(`Testing variation ${i + 1}: ${query.aspectRatio} - ${query.size || "1K"}`);

      const result = await this.imagenService.generateImages(query);

      if (result.success && result.images) {
        for (const image of result.images) {
          const filename = `variation-${i + 1}-${image.filename}`;
          const filePath = await saveImageToFile(
            image.data,
            filename,
            this.outputDir
          );
          savedFiles.push(filePath);
        }
      }
    }

    return savedFiles;
  }

  /**
   * Create test gallery HTML
   */
  async createTestGallery(imagePaths: string[]): Promise<string> {
    const galleryData = imagePaths.map((filePath) => {
      const filename = path.basename(filePath);
      const imageBuffer = require("fs").readFileSync(filePath);
      const dataUri = imageToDataUri(imageBuffer);
      
      return { filename, dataUri };
    });

    const html = createImageGalleryHtml(galleryData);
    const galleryPath = path.join(this.outputDir, "gallery.html");
    
    require("fs").writeFileSync(galleryPath, html);
    logger.info(`📄 Gallery created: ${galleryPath}`);
    
    return galleryPath;
  }

  /**
   * Run comprehensive test suite
   */
  async runFullTest(): Promise<void> {
    try {
      logger.info("🚀 Starting comprehensive Imagen API test...");

      // Test connection
      await this.testConnection();

      // Test AR glasses generation
      const arFiles = await this.testARGlassesGeneration();
      
      // Test parameter variations
      const variationFiles = await this.testParameterVariations();

      // Combine all files
      const allFiles = [...arFiles, ...variationFiles];
      
      if (allFiles.length > 0) {
        // Create gallery
        await this.createTestGallery(allFiles);
        
        logger.info(`✅ Test completed successfully! Generated ${allFiles.length} images.`);
        logger.info(`📁 Images saved to: ${this.outputDir}`);
      } else {
        logger.warn("⚠️ No images were generated during the test.");
      }

    } catch (error) {
      logger.error({ error }, "❌ Test failed");
      throw error;
    }
  }
}

/**
 * Simple test runner function
 */
export async function runImagenTest(apiKey: string, outputDir: string): Promise<void> {
  if (!apiKey) {
    throw new Error("API key is required for Imagen test");
  }
  const tester = new ImagenTester(apiKey, outputDir);
  await tester.runFullTest();
}