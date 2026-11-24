/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// The Barcode Detection API (Chrome on Android); not yet in TypeScript's DOM types.
interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource | ImageBitmapSource): Promise<DetectedBarcode[]>;
}
