/**
 * Validation utilities
 */

import { z } from 'zod';

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string (remove control characters, trim)
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim();
}

/**
 * Validate and sanitize topic
 */
export function validateTopic(topic: string): { valid: boolean; error?: string; sanitized?: string } {
  const sanitized = sanitizeString(topic);

  if (!sanitized) {
    return { valid: false, error: 'Topic cannot be empty' };
  }

  if (sanitized.length < 3) {
    return { valid: false, error: 'Topic must be at least 3 characters' };
  }

  if (sanitized.length > 500) {
    return { valid: false, error: 'Topic must be at most 500 characters' };
  }

  return { valid: true, sanitized };
}

/**
 * Validate URLs array
 */
export function validateUrls(urls: string[]): { valid: boolean; error?: string; validUrls?: string[] } {
  if (urls.length === 0) {
    return { valid: true, validUrls: [] };
  }

  if (urls.length > 50) {
    return { valid: false, error: 'Maximum 50 URLs allowed' };
  }

  const validUrls: string[] = [];
  const invalidUrls: string[] = [];

  for (const url of urls) {
    if (isValidUrl(url)) {
      validUrls.push(url);
    } else {
      invalidUrls.push(url);
    }
  }

  if (invalidUrls.length > 0) {
    return {
      valid: false,
      error: `Invalid URLs: ${invalidUrls.slice(0, 5).join(', ')}${invalidUrls.length > 5 ? '...' : ''}`,
    };
  }

  return { valid: true, validUrls };
}

/**
 * Validate confidence score (0.0-1.0)
 */
export function validateConfidence(score: number): boolean {
  return typeof score === 'number' && score >= 0 && score <= 1 && !isNaN(score);
}

/**
 * Validate and parse date
 */
export function validateDate(date: string | Date): { valid: boolean; error?: string; parsed?: Date } {
  try {
    const parsed = date instanceof Date ? date : new Date(date);

    if (isNaN(parsed.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }

    return { valid: true, parsed };
  } catch {
    return { valid: false, error: 'Invalid date format' };
  }
}

/**
 * Safe parse with Zod schema
 */
export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  error?: string;
} {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
  return { success: false, error: errors };
}

/**
 * Validate file path (basic check)
 */
export function isValidPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check for null bytes
  if (filePath.includes('\0')) {
    return false;
  }

  // Check for path traversal attempts
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('../') || normalized.includes('/..')) {
    return false;
  }

  return true;
}

/**
 * Clamp number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Validate pagination parameters
 */
export function validatePagination(
  limit?: number,
  offset?: number
): { valid: boolean; error?: string; limit: number; offset: number } {
  const defaultLimit = 10;
  const maxLimit = 100;
  const validLimit = limit ? clamp(limit, 1, maxLimit) : defaultLimit;
  const validOffset = offset ? Math.max(0, offset) : 0;

  return {
    valid: true,
    limit: validLimit,
    offset: validOffset,
  };
}

export default {
  isValidUrl,
  isValidEmail,
  sanitizeString,
  validateTopic,
  validateUrls,
  validateConfidence,
  validateDate,
  safeParse,
  isValidPath,
  clamp,
  validatePagination,
};
