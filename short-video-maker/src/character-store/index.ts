/**
 * Character Store Module
 *
 * GCS-based character storage for maintaining consistent characters
 * across multiple video generations on a single channel.
 *
 * Usage:
 * 1. Create a profile with characters (e.g., "otter-couple" with "husband" and "wife")
 * 2. Reference the profile when generating videos
 * 3. Characters and their reference images persist across sessions
 */

export * from './types';
export { CharacterStorageService } from './CharacterStorageService';
