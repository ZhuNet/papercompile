import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import PdfjsViewerElement from 'pdfjs-viewer-element';
import { currentPageFromPositions, zoomFromWheel } from './compiledPreview';
import { BlobPdfSource, pdfDownloadName, saveCompiledPdf } from './pdfViewer';

export function PdfPreview(props: {
  data: Uint8Array<ArrayBuffer>;
  entryFile: string;
}) {
  let container: HTMLDivElement | undefined;
  const [viewer, setViewer] = createSignal<PdfjsViewerElement>();
  const [loadError, setLoadError] = createSignal('');
  let generation = 0;
  let disposed = false;
  let removeDownloadListener: (() => void) | undefined;
  const source = new BlobPdfSource();

  onMount(() => {
    const pdfjsAssets = `${import.meta.env.BASE_URL}pdfjs`;
    const element = new PdfjsViewerElement();
    element.setAttribute('iframe-title', 'PDF 正文查看器');
    element.setAttribute('viewer-css-theme', 'LIGHT');
    element.setAttribute('pagemode', 'none');
    element.setAttribute('c-map-url', `${pdfjsAssets}/cmaps/`);
    element.setAttribute('icc-url', `${pdfjsAssets}/iccs/`);
    element.setAttribute('sandbox-bundle-src', `${pdfjsAssets}/build/pdf.sandbox.mjs`);
    element.setAttribute('standard-font-data-url', `${pdfjsAssets}/standard_fonts/`);
    element.setAttribute('wasm-url', `${pdfjsAssets}/wasm/`);
    container?.append(element);
    setViewer(element);
  });

  createEffect(() => {
    const url = source.replace(props.data);
    const filename = pdfDownloadName(props.entryFile);
    const currentGeneration = ++generation;
    void viewer()?.initPromise
      .then(async ({ viewerApp }) => {
        if (disposed || currentGeneration !== generation || !viewerApp) return;
        if (!removeDownloadListener) {
          const viewerDocument = viewer()?.iframe.contentDocument;
          const download = (event: MouseEvent) => {
            const target = event.target as { closest?: (selector: string) => Element | null } | null;
            if (!target?.closest?.('#downloadButton, #secondaryDownload')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            void saveCompiledPdf(
              props.data,
              pdfDownloadName(props.entryFile),
              (defaultPath) => save({
                defaultPath,
                filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
              }),
              (path, data) => invoke('save_compiled_pdf', { path, data }),
            ).catch((error: unknown) => {
              console.error('PDF download failed', error);
              setLoadError(`PDF 保存失败：${String(error)}`);
            });
          };
          viewerDocument?.addEventListener('click', download, true);
          removeDownloadListener = () => viewerDocument?.removeEventListener('click', download, true);
        }
        await viewerApp.open({ url, originalUrl: filename });
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!disposed && currentGeneration === generation) {
          console.error('PDF viewer failed to load', error);
          setLoadError('PDF 查看器加载失败，请重新编译或重启应用。');
        }
      });
  });

  onCleanup(() => {
    disposed = true;
    generation += 1;
    removeDownloadListener?.();
    source.dispose();
  });

  return <div class="pdf-viewer-host" ref={container}>
    <Show when={loadError()}>{(message) => <div class="pdf-viewer-error">{message()}</div>}</Show>
  </div>;
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
