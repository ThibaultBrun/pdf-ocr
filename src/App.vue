<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">PDF OCR local</p>
        <h1>Transformer un PDF scanne en PDF OCR selectionnable</h1>
      </div>

      <div class="actions">
        <label class="toggle">
          <input v-model="preprocessImage" type="checkbox" />
          <span>Nettoyer image avant OCR</span>
        </label>
        <label class="toggle">
          <input v-model="debugVisibleText" type="checkbox" />
          <span>Texte visible pour debug</span>
        </label>
        <button class="ghost" :disabled="!loadedPdf" @click="loadOcrJson">Recharger JSON OCR</button>
        <button class="ghost" :disabled="!loadedPdf" @click="exportTxtFile">Exporter TXT</button>
        <button class="ghost" :disabled="!loadedPdf" @click="exportJsonFile">Exporter JSON</button>
        <button class="ghost" :disabled="!loadedPdf" @click="exportZipFile">Exporter ZIP</button>
        <button class="primary" :disabled="!loadedPdf" @click="exportPdfFile">Exporter PDF OCR</button>
      </div>
    </header>

    <div v-if="compatibilityIssue" class="banner error">
      {{ compatibilityIssue }}
    </div>
    <div v-if="errorMessage" class="banner error">
      {{ errorMessage }}
    </div>

    <main class="layout">
      <aside class="panel panel-pages">
        <div
          class="upload-zone"
          :class="{ active: isDragOver }"
          @dragenter.prevent="isDragOver = true"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          @drop.prevent="handleDrop"
        >
          <input ref="fileInputRef" class="hidden-input" type="file" accept="application/pdf" @change="handleFileChange" />
          <p>Deposer un PDF ici</p>
          <button class="secondary" type="button" @click="fileInputRef?.click()">Choisir un fichier</button>
          <small>Limite recommandee: 40 Mo</small>
        </div>

        <div v-if="loadedPdf" class="document-meta">
          <strong>{{ loadedPdf.fileName }}</strong>
          <span>{{ loadedPdf.pages.length }} pages</span>
          <span>{{ humanFileSize(loadedPdf.fileSize) }}</span>
        </div>

        <div class="page-list">
          <button
            v-for="page in pages"
            :key="page.id"
            class="page-card"
            :class="{ selected: page.index === selectedPageIndex }"
            type="button"
            @click="selectedPageIndex = page.index"
          >
            <img :src="page.thumbnailDataUrl" :alt="`Miniature page ${page.index + 1}`" />
            <div class="page-card-content">
              <div class="page-card-title">
                <span>Page {{ page.index + 1 }}</span>
                <span class="status" :class="page.status">{{ page.status }}</span>
              </div>
              <div class="progress-track">
                <div class="progress-bar" :style="{ width: `${Math.round(page.progress * 100)}%` }"></div>
              </div>
              <small>{{ Math.round(page.progress * 100) }}%</small>
            </div>
          </button>
        </div>
      </aside>

      <section class="panel panel-preview">
        <div class="toolbar">
          <div class="toolbar-group">
            <button class="secondary" type="button" :disabled="!loadedPdf || isRunningOcr" @click="runCurrentPageOcr">
              OCR page courante
            </button>
            <button class="primary" type="button" :disabled="!loadedPdf || isRunningOcr" @click="runAllPagesOcr">
              OCR toutes les pages
            </button>
            <button class="ghost danger" type="button" :disabled="!isRunningOcr" @click="cancelOcr">Annuler</button>
          </div>

          <div v-if="loadedPdf" class="toolbar-group progress-summary">
            <span>{{ globalProgressLabel }}</span>
            <div class="progress-track large">
              <div class="progress-bar" :style="{ width: `${Math.round(globalProgress * 100)}%` }"></div>
            </div>
          </div>
        </div>

        <div v-if="currentPage" class="preview-wrapper">
          <div class="preview-canvas">
            <img :src="currentPreviewUrl" :alt="`Previsualisation page ${currentPage.index + 1}`" />
          </div>
          <div class="preview-footer">
            <span>Confiance OCR: {{ currentPage.ocr ? `${currentPage.ocr.confidence.toFixed(1)}%` : 'N/A' }}</span>
            <span>{{ currentPage.ocr?.words.length ?? 0 }} mots detectes</span>
            <span>{{ currentPage.ocr?.lines.length ?? 0 }} lignes</span>
          </div>
        </div>
        <div v-else class="empty-state">
          Charger un PDF pour commencer.
        </div>
      </section>

      <aside class="panel panel-editor">
        <div class="editor-header">
          <h2>Texte OCR editable</h2>
          <span v-if="currentPage">Page {{ currentPage.index + 1 }}</span>
        </div>

        <textarea
          v-if="currentPage"
          v-model="editableText"
          class="editor"
          placeholder="Le texte OCR apparaitra ici apres traitement."
          @input="updateEditedText"
        ></textarea>
        <div v-else class="empty-state">
          Selectionner une page.
        </div>

        <div v-if="currentPage?.error" class="inline-error">
          {{ currentPage.error }}
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { exportJson, exportPdf, exportTxt, exportZip, importSavedJson } from './services/exportService';
import { OcrService } from './services/ocrService';
import { applyImagePreprocessing, isBrowserSupported, loadPdfFile } from './services/pdfService';
import type { LoadedPdfDocument, PdfPageItem } from './types';

const compatibility = isBrowserSupported();
const compatibilityIssue = !compatibility.supported
  ? `Navigateur non compatible: ${compatibility.issues.join(', ')}`
  : '';

const fileInputRef = ref<HTMLInputElement | null>(null);
const loadedPdf = ref<LoadedPdfDocument | null>(null);
const selectedPageIndex = ref(0);
const errorMessage = ref('');
const editableText = ref('');
const isDragOver = ref(false);
const preprocessImage = ref(true);
const debugVisibleText = ref(false);
const isRunningOcr = ref(false);
const ocrProgressLabel = ref('En attente');

const ocrService = new OcrService();

const pages = computed(() => loadedPdf.value?.pages ?? []);
const currentPage = computed(() => pages.value[selectedPageIndex.value] ?? null);
const currentPreviewUrl = computed(() => {
  if (!currentPage.value) {
    return '';
  }

  return preprocessImage.value ? currentPage.value.image.processedDataUrl : currentPage.value.image.originalDataUrl;
});
const globalProgress = computed(() => {
  if (!pages.value.length) {
    return 0;
  }

  return pages.value.reduce((sum, page) => sum + page.progress, 0) / pages.value.length;
});
const globalProgressLabel = computed(() => `${ocrProgressLabel.value} (${Math.round(globalProgress.value * 100)}%)`);

watch(currentPage, (page) => {
  editableText.value = page?.editedText ?? '';
}, { immediate: true });

watch(preprocessImage, async (enabled) => {
  if (!enabled || !loadedPdf.value) {
    return;
  }

  try {
    await Promise.all(loadedPdf.value.pages.map(async (page) => {
      if (page.image.processed) {
        return;
      }

      page.image.processedDataUrl = await applyImagePreprocessing(page.image.originalDataUrl);
      page.image.processed = true;
    }));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Pretraitement impossible.';
  }
});

async function handleSelectedFile(file?: File): Promise<void> {
  if (!file) {
    return;
  }

  errorMessage.value = '';
  selectedPageIndex.value = 0;

  try {
    loadedPdf.value = await loadPdfFile(file);

    if (preprocessImage.value && loadedPdf.value) {
      await Promise.all(loadedPdf.value.pages.map(async (page) => {
        page.image.processedDataUrl = await applyImagePreprocessing(page.image.originalDataUrl);
        page.image.processed = true;
      }));
    }
  } catch (error) {
    loadedPdf.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Erreur de chargement du PDF.';
  }
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  void handleSelectedFile(file);
  input.value = '';
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  const file = event.dataTransfer?.files?.[0];
  void handleSelectedFile(file);
}

function updateEditedText(): void {
  if (!currentPage.value) {
    return;
  }

  currentPage.value.editedText = editableText.value;
}

async function runOcrOnPages(targetPages: PdfPageItem[]): Promise<void> {
  if (!loadedPdf.value || !targetPages.length) {
    return;
  }

  isRunningOcr.value = true;
  errorMessage.value = '';

  try {
    for (const page of targetPages) {
      page.status = 'processing';
      page.progress = 0;
      page.error = undefined;
      ocrProgressLabel.value = `OCR page ${page.index + 1}/${pages.value.length}`;

      const dataUrl = preprocessImage.value ? page.image.processedDataUrl : page.image.originalDataUrl;
      const ocr = await ocrService.recognizePage(
        page.index,
        dataUrl,
        {
          language: 'fra',
          preprocessImage: preprocessImage.value,
        },
        (event) => {
          if (event.pageIndex === -1 || event.pageIndex === page.index) {
            page.progress = event.progress;
          }
        },
      );

      page.ocr = ocr;
      page.editedText = ocr.text.trim();
      if (page.index === selectedPageIndex.value) {
        editableText.value = page.editedText;
      }
      page.progress = 1;
      page.status = 'done';
    }

    ocrProgressLabel.value = 'OCR termine';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR echoue.';
    errorMessage.value = message;

    for (const page of targetPages.filter((item) => item.status === 'processing')) {
      page.status = message === 'OCR annule.' ? 'cancelled' : 'error';
      page.error = message;
    }
  } finally {
    isRunningOcr.value = false;
    await ocrService.dispose();
  }
}

function runCurrentPageOcr(): void {
  if (currentPage.value) {
    void runOcrOnPages([currentPage.value]);
  }
}

function runAllPagesOcr(): void {
  void runOcrOnPages([...pages.value]);
}

function cancelOcr(): void {
  ocrService.cancel();
  ocrProgressLabel.value = 'Annulation en cours';
}

function exportTxtFile(): void {
  if (loadedPdf.value) {
    exportTxt(loadedPdf.value);
  }
}

function exportJsonFile(): void {
  if (loadedPdf.value) {
    exportJson(loadedPdf.value);
  }
}

async function exportPdfFile(): Promise<void> {
  if (!loadedPdf.value) {
    return;
  }

  try {
    await exportPdf(loadedPdf.value, debugVisibleText.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Export PDF impossible.';
  }
}

async function exportZipFile(): Promise<void> {
  if (!loadedPdf.value) {
    return;
  }

  try {
    await exportZip(loadedPdf.value, debugVisibleText.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Export ZIP impossible.';
  }
}

function loadOcrJson(): void {
  if (!loadedPdf.value) {
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0];

    if (!file || !loadedPdf.value) {
      return;
    }

    try {
      const content = await file.text();
      const json = importSavedJson(content);

      json.pages.forEach((savedPage) => {
        const page = loadedPdf.value?.pages[savedPage.index];
        if (!page) {
          return;
        }

        page.editedText = savedPage.text;
        page.ocr = savedPage.ocr;
        page.status = savedPage.status;
        page.progress = savedPage.status === 'done' ? 1 : page.progress;
      });

      editableText.value = currentPage.value?.editedText ?? '';
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Import JSON impossible.';
    }
  };
  input.click();
}

function humanFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
</script>
