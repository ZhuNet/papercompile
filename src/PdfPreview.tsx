import { For, createEffect, createSignal, onCleanup } from 'solid-js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { currentPageFromPositions, pageSizeAtZoom, zoomFromWheel } from './compiledPreview';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

export function PdfPreview(props: {
  data: Uint8Array<ArrayBuffer>;
  zoom: number;
  targetPage: number;
  navigationRequest: number;
  onZoom: (zoom: number) => void;
  onPageChange: (page: number, total: number) => void;
}) {
  const [document, setDocument] = createSignal<PdfDocument>();
  const [pages, setPages] = createSignal<number[]>([]);
  let container: HTMLElement | undefined;

  createEffect(() => {
    const task = pdfjsLib.getDocument({ data: props.data.slice() });
    void task.promise.then((pdf) => {
      setDocument(pdf);
      setPages(Array.from({ length: pdf.numPages }, (_, index) => index + 1));
      props.onPageChange(1, pdf.numPages);
    });
    onCleanup(() => void task.destroy());
  });

  createEffect(() => {
    const page = props.targetPage;
    props.navigationRequest;
    queueMicrotask(() => {
      const target = container?.querySelector<HTMLElement>(`[data-page="${page}"]`);
      if (container && target) container.scrollTo({ top: Math.max(0, target.offsetTop - 24), behavior: 'smooth' });
    });
  });

  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    props.onZoom(zoomFromWheel(props.zoom, event.deltaY, true));
  };
  const scroll = () => {
    if (!container) return;
    const pageTops = Array.from(container.querySelectorAll<HTMLElement>('[data-page]')).map((page) => page.offsetTop);
    const page = currentPageFromPositions(container.scrollTop, container.clientHeight, pageTops);
    if (page) props.onPageChange(page, pages().length);
  };

  return <section class="pdf-pages" ref={container} onWheel={wheel} onScroll={scroll}>
    <For each={pages()}>{(page) => <PdfPage document={document()!} page={page} zoom={props.zoom} />}</For>
  </section>;
}

export function TextDocumentPreview(props: {
  pages: string[];
  zoom: number;
  targetPage: number;
  navigationRequest: number;
  onZoom: (zoom: number) => void;
  onPageChange: (page: number, total: number) => void;
}) {
  let container: HTMLElement | undefined;
  createEffect(() => {
    const page = props.targetPage;
    props.navigationRequest;
    queueMicrotask(() => {
      const target = container?.querySelector<HTMLElement>(`[data-page="${page}"]`);
      if (container && target) container.scrollTo({ top: Math.max(0, target.offsetTop - 24), behavior: 'smooth' });
    });
  });
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    props.onZoom(zoomFromWheel(props.zoom, event.deltaY, true));
  };
  const scroll = () => {
    if (!container) return;
    const tops = Array.from(container.querySelectorAll<HTMLElement>('[data-page]')).map((page) => page.offsetTop);
    const page = currentPageFromPositions(container.scrollTop, container.clientHeight, tops);
    if (page) props.onPageChange(page, props.pages.length);
  };
  return <section class="pdf-pages" ref={container} onWheel={wheel} onScroll={scroll}>
    <For each={props.pages}>{(text, index) => <div class="text-document-page" data-page={index() + 1} style={{ width: `${794 * props.zoom / 100}px`, height: `${1123 * props.zoom / 100}px`, padding: `${58 * props.zoom / 100}px ${64 * props.zoom / 100}px` }}><pre style={{ "font-size": `${12 * props.zoom / 100}px` }}>{text}</pre></div>}</For>
  </section>;
}

function PdfPage(props: { document: PdfDocument; page: number; zoom: number }) {
  let canvas: HTMLCanvasElement | undefined;
  let textContainer: HTMLDivElement | undefined;
  let renderTask: pdfjsLib.RenderTask | undefined;
  let textLayer: pdfjsLib.TextLayer | undefined;
  let generation = 0;
  const [size, setSize] = createSignal({ width: 595, height: 842, scale: 1 });

  createEffect(() => {
    const zoom = props.zoom;
    const currentGeneration = ++generation;
    const previousTask = renderTask;
    previousTask?.cancel();
    textLayer?.cancel();
    void (async () => {
      if (previousTask) {
        await previousTask.promise.catch(() => undefined);
      }
      const page = await props.document.getPage(props.page);
      if (currentGeneration !== generation || !canvas) return;
      const base = page.getViewport({ scale: 1 });
      const dimensions = pageSizeAtZoom(base.width, base.height, zoom);
      setSize(dimensions);
      const displayViewport = page.getViewport({ scale: dimensions.scale });
      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: dimensions.scale * pixelRatio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${dimensions.width}px`;
      canvas.style.height = `${dimensions.height}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      void renderTask.promise.catch((error: unknown) => {
        if (!(error instanceof Error) || error.name !== 'RenderingCancelledException') console.error(error);
      });
      if (textContainer) {
        textContainer.replaceChildren();
        textContainer.style.setProperty('--total-scale-factor', String(dimensions.scale));
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textContainer,
          viewport: displayViewport,
        });
        await textLayer.render();
      }
    })();
    onCleanup(() => {
      if (currentGeneration === generation) generation += 1;
      renderTask?.cancel();
      textLayer?.cancel();
    });
  });

  return <div class="pdf-page-block" data-page={props.page} style={{ width: `${size().width}px` }}>
    <canvas ref={canvas} />
    <div class="textLayer" ref={textContainer} />
  </div>;
}
