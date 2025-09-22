import fs from "fs-extra";
import path from "path";
import { logger } from "../../config";

/**
 * Save image buffer to file with timestamp folder organization
 */
export async function saveImageToFile(
  imageBuffer: Buffer,
  filename: string,
  outputDir: string,
  options?: {
    setName?: string;
    category?: string;
    createTimestampFolder?: boolean;
  }
): Promise<string> {
  try {
    const { setName, category, createTimestampFolder = true } = options || {};
    
    let targetDir = outputDir;
    
    if (createTimestampFolder) {
      // Create timestamp folder (YYYY-MM-DD_HH-mm-ss)
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/T/, '_')
        .replace(/:/g, '-')
        .split('.')[0];
      
      targetDir = path.join(outputDir, timestamp);
    }
    
    // Add category subfolder if specified
    if (category) {
      targetDir = path.join(targetDir, category);
    }
    
    // Add set name subfolder if specified
    if (setName) {
      targetDir = path.join(targetDir, setName);
    }
    
    await fs.ensureDir(targetDir);
    
    const filePath = path.join(targetDir, filename);
    await fs.writeFile(filePath, imageBuffer);
    
    logger.info({ 
      filePath, 
      size: imageBuffer.length, 
      setName, 
      category,
      folder: path.relative(outputDir, targetDir)
    }, "Image saved to organized folder");
    return filePath;
  } catch (error) {
    logger.error({ error, filename, outputDir }, "Failed to save image");
    throw error;
  }
}

/**
 * Convert image buffer to base64 data URI
 */
export function imageToDataUri(imageBuffer: Buffer, mimeType: string = "image/png"): string {
  const base64 = imageBuffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Get image metadata (basic info)
 */
export function getImageMetadata(imageBuffer: Buffer) {
  return {
    size: imageBuffer.length,
    sizeFormatted: formatBytes(imageBuffer.length),
  };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Generate filename with timestamp
 */
export function generateImageFilename(prefix: string = "imagen", extension: string = "png"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}.${extension}`;
}

/**
 * Validate image buffer
 */
export function validateImageBuffer(buffer: Buffer): { valid: boolean; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "Image buffer is empty" };
  }

  // Check for common image format headers
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff]);
  
  if (buffer.subarray(0, 4).equals(pngHeader)) {
    return { valid: true };
  }
  
  if (buffer.subarray(0, 3).equals(jpegHeader)) {
    return { valid: true };
  }

  return { valid: false, error: "Unsupported image format" };
}

/**
 * Save multiple images to an organized set folder
 */
export async function saveImageSet(
  images: Array<{ data: Buffer; filename: string; prompt?: string }>,
  outputDir: string,
  setOptions: {
    setName: string;
    category?: string;
    description?: string;
  }
): Promise<{
  folderPath: string;
  savedImages: Array<{ filename: string; filePath: string; size: number }>;
}> {
  try {
    const { setName, category, description } = setOptions;
    
    // Create set folder with timestamp
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .split('.')[0];
    
    let setFolder = path.join(outputDir, timestamp);
    
    if (category) {
      setFolder = path.join(setFolder, category);
    }
    
    setFolder = path.join(setFolder, setName);
    await fs.ensureDir(setFolder);
    
    // Save metadata file
    const metadata = {
      setName,
      category,
      description,
      timestamp,
      imageCount: images.length,
      images: images.map((img, index) => ({
        filename: img.filename,
        prompt: img.prompt,
        index,
        size: img.data.length
      }))
    };
    
    await fs.writeFile(
      path.join(setFolder, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Save all images to the set folder
    const savedImages = [];
    for (const image of images) {
      const filePath = path.join(setFolder, image.filename);
      await fs.writeFile(filePath, image.data);
      
      savedImages.push({
        filename: image.filename,
        filePath,
        size: image.data.length
      });
    }
    
    logger.info({ 
      setFolder, 
      setName, 
      category, 
      imageCount: images.length 
    }, "Image set saved to organized folder");
    
    return {
      folderPath: setFolder,
      savedImages
    };
  } catch (error) {
    logger.error({ error, setOptions }, "Failed to save image set");
    throw error;
  }
}

/**
 * Create image gallery HTML for testing
 */
export function createImageGalleryHtml(images: Array<{ filename: string; dataUri: string }>): string {
  const imageElements = images
    .map(
      (img) => `
    <div class="image-item">
      <img src="${img.dataUri}" alt="${img.filename}" style="max-width: 300px; margin: 10px;" />
      <p>${img.filename}</p>
    </div>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Generated Images</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .gallery { display: flex; flex-wrap: wrap; }
    .image-item { margin: 10px; text-align: center; }
    img { border: 1px solid #ddd; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Generated Images</h1>
  <div class="gallery">
    ${imageElements}
  </div>
</body>
</html>
  `;
}