// Reads the text out of photos (recipe cards, cookbook pages, screenshots) and PDFs.
// Everything runs on the phone itself: free, and nothing is sent to anyone.
// The reading tools are only downloaded the first time someone scans.

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
const TESS_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const TESS_LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/legacy/build/';

const MAX_PDF_PAGES = 6;

let ocrWorker = null;
let ocrProgress = () => {};

async function getOcr() {
  if (ocrWorker) return ocrWorker;
  const { default: Tesseract } = await import(TESS + 'tesseract.esm.min.js');
  ocrWorker = await Tesseract.createWorker('eng', 1, {
    workerPath: TESS + 'worker.min.js',
    corePath: TESS_CORE,
    langPath: TESS_LANG,
    logger: (m) => ocrProgress(m),
  });
  return ocrWorker;
}

let pdfjs = null;
async function getPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(PDFJS + 'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  return pdfjs;
}

// Big phone photos are slow to read and can run out of memory, so shrink them first.
async function imageToCanvas(file, max = 2200) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

async function ocr(canvas, label, report) {
  ocrProgress = (m) => {
    if (m.status === 'recognizing text') report(`${label} ${Math.round(m.progress * 100)}%`);
    else if (/load|initializ/i.test(m.status)) report('Getting the reader ready (first time takes a moment)…');
  };
  const worker = await getOcr();
  report(`${label} 0%`);
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}

// Turns a PDF page's text pieces back into lines.
function pageLines(items) {
  const lines = [];
  let line = '', lastY = null;
  for (const it of items) {
    const y = it.transform ? Math.round(it.transform[5]) : lastY;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.trim()) { lines.push(line); line = ''; }
    line += it.str;
    lastY = y;
    if (it.hasEOL) { lines.push(line); line = ''; }
  }
  if (line.trim()) lines.push(line);
  return lines.join('\n');
}

async function readPdf(file, report) {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = Math.min(doc.numPages, MAX_PDF_PAGES);
  let text = '';
  for (let i = 1; i <= n; i++) {
    report(`Reading PDF page ${i} of ${n}…`);
    const page = await doc.getPage(i);
    let pageText = pageLines((await page.getTextContent()).items);
    if (pageText.replace(/\s/g, '').length < 40) {
      // A scanned PDF (just a picture of the page), so read it like a photo
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      pageText = await ocr(canvas, `Reading scanned page ${i} of ${n}…`, report);
    }
    text += pageText + '\n\n';
  }
  return text;
}

// files: a list of images and/or PDFs (several photos = several pages of one recipe)
export async function readRecipeFiles(files, report = () => {}) {
  let text = '';
  const list = [...files];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (isPdf) {
      text += await readPdf(f, report);
    } else {
      report('Preparing photo…');
      const label = list.length > 1 ? `Reading photo ${i + 1} of ${list.length}…` : 'Reading photo…';
      text += (await ocr(await imageToCanvas(f), label, report)) + '\n\n';
    }
  }
  return text;
}
