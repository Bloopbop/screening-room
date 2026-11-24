import { toIsbn13 } from './isbn';

/** Whether this phone can read barcodes itself (Chrome on Android can). */
export async function canScan(): Promise<boolean> {
  if (typeof BarcodeDetector === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    return (await BarcodeDetector.getSupportedFormats()).includes('ean_13');
  } catch {
    return false;
  }
}

/**
 * Opens the back camera into the video element and watches for a book's
 * barcode: an EAN-13 starting 978 or 979 (the price add-on is ignored).
 * Returns a function that stops the camera.
 */
export async function startScanner(video: HTMLVideoElement, onIsbn: (isbn: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  const detector = new BarcodeDetector({ formats: ['ean_13'] });
  let stopped = false;
  let timer = 0;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
  const look = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        for (const code of await detector.detect(video)) {
          const isbn = toIsbn13(code.rawValue);
          if (isbn && !stopped) {
            stop();
            onIsbn(isbn);
            return;
          }
        }
      }
    } catch {
      // A frame that couldn't be read; try the next.
    }
    timer = window.setTimeout(look, 200);
  };
  void look();
  return stop;
}
