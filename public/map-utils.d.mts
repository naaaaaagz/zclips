export type SharedPlace = {
  id: number; name: string; clipUrl: string; category: string;
  sourceKeywords: string; keywords: string; latitude: number; longitude: number;
  twitchTitle: string; country: string; clipDate: string; top: boolean;
  twitchCategory: string; twitchKeywords: string;
};
export function parseCoordinates(value: unknown): { latitude: number; longitude: number } | null;
export function getClipId(url: string): string;
export function parseSheetPlaces(rows: unknown, metadata?: Record<string, {category?: string; language?: string}>): SharedPlace[];
export function createTilePrefetcher(fetcher?: typeof fetch): {update(urls: string[]): void; dispose(): void};
export function activateModalFocus(dialog: HTMLElement, onClose: () => void): () => void;
