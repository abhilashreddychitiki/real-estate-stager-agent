/**
 * @fileoverview Staging Prompt Builder
 *
 * Crafts optimized text prompts for Seedance 2.0 real-estate virtual staging.
 * Isolated from the main handler so prompts can be A/B tested independently
 * without touching the processing pipeline.
 *
 * Supports configurable style presets (modern, mid-century, minimalist, etc.)
 * and room type hints (living-room, bedroom, kitchen, etc.).
 */

import type { StagingPromptOptions } from '../types/index.js';

/** Maps style preset keys to descriptive text used in the prompt. */
const STYLE_DESCRIPTIONS: Record<string, string> = {
  'modern': 'modern contemporary style with clean lines, neutral tones, and elegant accents',
  'mid-century': 'mid-century modern style with warm woods, organic shapes, and retro-inspired furniture',
  'minimalist': 'minimalist style with sparse furnishings, monochromatic palette, and open space',
  'scandinavian': 'Scandinavian style with light woods, cozy textiles, and hygge-inspired warmth',
  'luxury': 'luxury high-end style with premium materials, statement lighting, and designer furniture',
};

/** Maps room type keys to descriptive text with appropriate furniture suggestions. */
const ROOM_DESCRIPTIONS: Record<string, string> = {
  'living-room': 'living space with a sofa, coffee table, area rug, and decorative accents',
  'bedroom': 'bedroom with a bed, nightstands, soft bedding, and ambient lighting',
  'kitchen': 'kitchen with counter styling, bar stools, pendant lights, and fresh greenery',
  'bathroom': 'bathroom with plush towels, spa accessories, and elegant fixtures',
  'office': 'home office with a desk, ergonomic chair, shelving, and warm task lighting',
};

/**
 * Build an optimized Seedance staging prompt for virtual real-estate staging.
 *
 * When called with no arguments, produces a high-quality general-purpose prompt
 * suitable for most empty room photos. Pass `style` and/or `roomType` for
 * more targeted results.
 *
 * The prompt instructs Seedance to:
 * - Add appropriate furniture and decor
 * - Preserve the original room structure exactly
 * - Produce photorealistic, magazine-quality output
 * - Create a smooth cinematic camera pan
 *
 * @param options - Optional style and room type overrides
 * @param options.style - Interior design style preset (e.g., 'modern', 'luxury')
 * @param options.roomType - Room type hint (e.g., 'living-room', 'bedroom')
 * @returns The constructed prompt string for Seedance 2.0
 */
export function buildStagingPrompt(options?: StagingPromptOptions): string {
  const style = options?.style
    ? STYLE_DESCRIPTIONS[options.style] ?? options.style
    : 'modern contemporary style with clean lines, neutral tones, and elegant accents';

  const room = options?.roomType
    ? ROOM_DESCRIPTIONS[options.roomType] ?? options.roomType
    : 'living space with elegant furniture, tasteful decor, and warm lighting';

  const prompt = [
    `Transform this empty room into a beautifully staged ${room} in a ${style}.`,
    'Add furniture, warm lighting, plants, and decorative elements.',
    'Maintain the original room structure, walls, windows, flooring, and architectural details exactly.',
    'Photorealistic quality suitable for a real estate listing or interior design magazine.',
    'Smooth cinematic camera pan revealing the fully staged space.',
  ].join(' ');

  console.log(`[STAGER][PROMPT] Built prompt (${prompt.length} chars): "${prompt.substring(0, 80)}..."`);

  return prompt;
}
