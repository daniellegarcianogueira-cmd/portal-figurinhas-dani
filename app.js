// ============================================================
//  app.js – Bonequinhas da Dani
//  Lógica principal: Supabase, upload, galeria, clipboard,
//  compartilhamento, PWA, service worker.
//  Sem bibliotecas externas além do Supabase SDK.
// ============================================================

'use strict';

// ── ✅ ÚNICA VARIÁVEL EXCLUSIVA DO APP.JS (não está no config.js) ──
const STORAGE_FOLDER = 'public'; // pasta onde os arquivos ficam no bucket

// ⚠️ ATENÇÃO: SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET,
// CATEGORIES, MAX_FILE_SIZE e COMMUNITY_CODE já estão declarados
// em config.js (carregado antes deste arquivo). NÃO redeclare aqui!

// ── 1. Inicialização do Supabase ─────────────────────────────
// CORREÇÃO: renomeado de 'supabase' para 'db' para evitar conflito com
// 'var supabase' declarado pelo SDK UMD (causava SyntaxError no carregamento).
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 2. Estado da aplicação ───────────────────────────────────
const state = {
  stickers: [],          // lista completa carregada do banco
  filtered: [],          // lista após filtros/busca
  searchQuery: '',
  categoryFilter: '',
  sortOrder: 'newest',
  isLoading: false,
  selectedFile: null,
};

// ── 3. Referências DOM ───────────────────────────────────────
const $ = (id) => document.getElementById(id);

const grid              = $('stickersGrid');
const loadingSpinner    = $('loadingSpinner');
const stickerCount      = $('stickerCount');
const searchInput       = $('searchInput');
const categoryFilter    = $('categoryFilter');
const sortSelect        = $('sortSelect');
const modalOverlay      = $('modalOverlay');
const btnOpenModal      = $('btnOpenModal');
const btnCloseModal     = $('btnCloseModal');
const uploadForm        = $('uploadForm');
const fileInput         = $('fileInput');
const uploadArea        = $('uploadArea');
const uploadPlaceholder = $('uploadPlaceholder');
const uploadPreview     = $('uploadPreview');
const previewImg        = $('previewImg');
const btnRemovePreview  = $('btnRemovePreview');
const categorySelect    = $('categorySelect');
const titleInput        = $('titleInput');
const captionInput      = $('captionInput');
const codeInput         = $('codeInput');
const btnSubmit         = $('btnSubmit');
const uploadProgress    = $('uploadProgress');
const progressBar       = $('progressBar');
const progressText      = $('progressText');
const lightbox          = $('lightbox');
const lightboxImg       = $('lightboxImg');
const lightboxClose     = $('lightboxClose');
const toastContainer    = $('toastContainer');
const offlineBanner     = $('offlineBanner');

// ── 4. Toast Notifications ───────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${message}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ── 5. Registro do Service Worker ────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('[SW] Registrado:', reg.scope))
      .catch((err) => console.warn('[SW] Falha no registro:', err));
  });
}

// ── 6. Detecção de conexão ───────────────────────────────────
function updateOnlineStatus() {
  if (!navigator.onLine) offlineBanner.classList.add('show');
  else offlineBanner.classList.remove('show');
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ── 7. Preencher selects de categoria ────────────────────────
function populateCategorySelects() {
  // Filtro da galeria
  CATEGORIES.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categoryFilter.appendChild(opt);
  });

  // Select do formulário
  CATEGORIES.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

// ── 8. Carregar figurinhas do Supabase ───────────────────────
async function loadStickers() {
  state.isLoading = true;
  loadingSpinner.style.display = 'flex';

  try {
    const { data, error } = await db
      .from('stickers')
      .select('*')
      .eq('status', 'public')
      .order('created_at', { ascending: false });

    if (error) throw error;

    state.stickers = data || [];
    applyFilters();
    updateCount();
  } catch (err) {
    console.error('[Supabase] Erro ao carregar:', err);
    showToast('Não foi possível carregar as figurinhas. Verifique sua conexão.', 'error');
    renderEmpty('Erro ao carregar figurinhas. Tente recarregar a página.');
  } finally {
    state.isLoading = false;
    loadingSpinner.style.display = 'none';
  }
}

// ── 9. Filtros e busca ───────────────────────────────────────
function applyFilters() {
  let list = [...state.stickers];

  // Busca por texto
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter((s) =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.caption || '').toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q)
    );
  }

  // Filtro por categoria
  if (state.categoryFilter) {
    list = list.filter((s) => s.category === state.categoryFilter);
  }

  // Ordenação
  switch (state.sortOrder) {
    case 'oldest':
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'title':
      list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'));
      break;
    default: // newest
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  state.filtered = list;
  renderGrid();
}

function updateCount() {
  const total = state.stickers.length;
  stickerCount.textContent = `${total} figurinha${total !== 1 ? 's' : ''}`;
}

// ── 10. Renderização do grid ─────────────────────────────────
function renderGrid() {
  // Remove cards existentes (mantém o spinner)
  Array.from(grid.children).forEach((child) => {
    if (child.id !== 'loadingSpinner') child.remove();
  });

  if (state.filtered.length === 0) {
    renderEmpty(
      state.searchQuery || state.categoryFilter
        ? 'Nenhuma figurinha encontrada para essa busca.'
        : 'Ainda não há figurinhas. Seja a primeira a enviar! 🎀'
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filtered.forEach((sticker) => fragment.appendChild(createCard(sticker)));
  grid.appendChild(fragment);
}

function renderEmpty(message) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  // CORREÇÃO: usar escapeHtml para evitar XSS
  div.innerHTML = `
    <div class="empty-icon">🎠</div>
    <h3>Nenhuma figurinha aqui</h3>
    <p>${escapeHtml(message)}</p>
  `;
  grid.appendChild(div);
}

// ── 11. Criar card de figurinha ──────────────────────────────
function createCard(sticker) {
  const card = document.createElement('article');
  card.className = 'sticker-card';
  card.setAttribute('role', 'listitem');
  card.dataset.id = sticker.id;

  const date = new Date(sticker.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const title    = escapeHtml(sticker.title || '');
  const caption  = escapeHtml(sticker.caption || '');
  const category = escapeHtml(sticker.category || '');
  const imgUrl   = sticker.image_url;

  card.innerHTML = `
    <div class="card-img-wrap" title="Clique para ampliar">
      <img
        src="${imgUrl}"
        alt="${title || 'Figurinha da comunidade'}"
        loading="lazy"
        decoding="async"
      />
      ${category ? `<span class="card-category-badge">${category}</span>` : ''}
    </div>
    <div class="card-body">
      ${title ? `<p class="card-title">${title}</p>` : ''}
      ${caption ? `<p class="card-caption">${caption}</p>` : ''}
      <p class="card-date">📅 ${date}</p>
    </div>
    <div class="card-actions">
      <button class="btn btn-copy-sticker" data-action="copy-sticker" data-url="${imgUrl}" title="Copiar figurinha para o Instagram">
        📋 Copiar Figurinha (Instagram)
      </button>
      <button class="btn btn-copy-caption" data-action="copy-caption" data-caption="${escapeAttr(sticker.caption || sticker.title || '')}" title="Copiar legenda">
        📝 Copiar Legenda
      </button>
      <button class="btn btn-save" data-action="save" data-url="${imgUrl}" data-title="${escapeAttr(title || 'figurinha')}" title="Salvar imagem">
        💾 Salvar
      </button>
      <button class="btn btn-share" data-action="share" data-url="${imgUrl}" data-title="${escapeAttr(title)}" data-caption="${escapeAttr(caption)}" title="Compartilhar">
        🔗 Compartilhar
      </button>
      <button class="btn btn-open" data-action="open" data-url="${imgUrl}" title="Abrir em nova aba">
        🔎 Abrir
      </button>
    </div>
  `;

  // Lightbox ao clicar na imagem
  card.querySelector('.card-img-wrap').addEventListener('click', () => openLightbox(imgUrl));

  // Delegação de eventos nos botões de ação
  card.querySelector('.card-actions').addEventListener('click', handleCardAction);

  return card;
}

// ── 12. Ações dos cards ──────────────────────────────────────
async function handleCardAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action  = btn.dataset.action;
  const url     = btn.dataset.url;
  const title   = btn.dataset.title || 'Figurinha';
  const caption = btn.dataset.caption || '';

  switch (action) {
    case 'copy-sticker':  await copySticker(url, btn);  break;
    case 'copy-caption':  copyCaption(caption);         break;
    case 'save':          saveImage(url, title);        break;
    case 'share':         shareSticker(url, title, caption); break;
    case 'open':          window.open(url, '_blank', 'noopener'); break;
  }
}

// ── 13. Copiar figurinha (Instagram) ────────────────────────
async function copySticker(imageUrl, btn) {
  // Verifica suporte à Clipboard API
  if (!navigator.clipboard || !window.ClipboardItem) {
    showToast(
      '⚠️ Seu navegador não suporta cópia de imagem. Tente no Chrome para Android (versão 76+) ou use o botão "Salvar" e cole manualmente.',
      'warning',
      7000
    );
    return;
  }

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Copiando…';

  try {
    // Busca a imagem via fetch (requer CORS liberado no Supabase Storage)
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    let pngBlob = blob;

    // Converte para PNG via canvas se necessário (WebP → PNG)
    if (blob.type !== 'image/png') {
      pngBlob = await convertToPng(blob);
    }

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob }),
    ]);

    showToast(
      '🎉 Figurinha copiada! Abra o Instagram e cole no Story (segure o dedo na tela → Colar).',
      'success',
      6000
    );
  } catch (err) {
    console.error('[Clipboard] Erro:', err);

    if (err.name === 'NotAllowedError') {
      showToast(
        '🔒 Permissão negada para copiar imagem. Certifique-se de estar usando HTTPS e toque novamente.',
        'error',
        6000
      );
    } else if (err.name === 'TypeError') {
      showToast(
        '⚠️ Este dispositivo/navegador não suporta cópia de imagem. Use o botão "Salvar" e importe no Instagram.',
        'warning',
        6000
      );
    } else {
      showToast(
        '❌ Não foi possível copiar a figurinha. Tente usar "Salvar" e depois importe no Instagram.',
        'error',
        5000
      );
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Converte Blob para PNG via Canvas
function convertToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error('Falha ao converter para PNG'));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
}

// ── 14. Copiar legenda ───────────────────────────────────────
async function copyCaption(text) {
  if (!text) {
    showToast('Esta figurinha não possui legenda.', 'info');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('📝 Legenda copiada!', 'success');
  } catch {
    // Fallback para browsers antigos
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('📝 Legenda copiada!', 'success');
  }
}

// ── 15. Salvar imagem ────────────────────────────────────────
async function saveImage(url, title) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const ext = blob.type === 'image/webp' ? 'webp' : 'png';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeFilename(title)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('💾 Figurinha salva!', 'success');
  } catch (err) {
    console.error('[Save]', err);
    window.open(url, '_blank', 'noopener');
    showToast('Abrindo imagem em nova aba para salvar manualmente.', 'info');
  }
}

// ── 16. Compartilhar ─────────────────────────────────────────
async function shareSticker(url, title, caption) {
  if (navigator.share) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const ext = blob.type === 'image/webp' ? 'webp' : 'png';
      const file = new File([blob], `${sanitizeFilename(title || 'figurinha')}.${ext}`, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: title || 'Figurinha Bonequinhas da Dani',
          text: caption || 'Confira essa figurinha! 🎀',
          files: [file],
        });
      } else {
        await navigator.share({
          title: title || 'Figurinha Bonequinhas da Dani',
          text: caption || 'Confira essa figurinha! 🎀',
          url: url,
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('Não foi possível compartilhar. Tente copiar o link manualmente.', 'error');
      }
    }
  } else {
    await copyCaption(url);
    showToast('🔗 Link da figurinha copiado! Cole onde quiser.', 'success');
  }
}

// ── 17. Lightbox ─────────────────────────────────────────────
function openLightbox(url) {
  lightboxImg.src = url;
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.classList.remove('active');
  lightboxImg.src = '';
  document.body.style.overflow = '';
}
lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

// ── 18. Modal ─────────────────────────────────────────────────────
function openModal() {
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  codeInput && codeInput.focus();
}
function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
  resetForm();
}
btnOpenModal && btnOpenModal.addEventListener('click', openModal);
btnCloseModal && btnCloseModal.addEventListener('click', closeModal);
modalOverlay && modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

// CORREÇÃO: listener único de Escape para evitar conflito entre lightbox e modal
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (lightbox.classList.contains('active')) {
    closeLightbox();
  } else {
    closeModal();
  }
});

// Abre modal via URL param ?action=add
if (new URLSearchParams(location.search).get('action') === 'add') {
  setTimeout(openModal, 500);
}

// ── 19. Upload: drag & drop e preview ────────────────────────
uploadArea && uploadArea.addEventListener('click', () => fileInput.click());
uploadArea && uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea && uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea && uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

fileInput && fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

btnRemovePreview && btnRemovePreview.addEventListener('click', (e) => {
  e.stopPropagation();
  clearFilePreview();
});

function handleFileSelect(file) {
  const error = validateFile(file);
  if (error) {
    showFieldError('fileError', error);
    clearFilePreview();
    return;
  }
  clearFieldError('fileError');
  state.selectedFile = file;
  showPreview(file);
}

function validateFile(file) {
  if (!['image/png', 'image/webp'].includes(file.type)) {
    return 'Apenas arquivos PNG ou WebP são aceitos.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `O arquivo é muito grande. Máximo permitido: 4 MB. Seu arquivo: ${(file.size / 1024 / 1024).toFixed(1)} MB.`;
  }
  return null;
}

function showPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    uploadPlaceholder.style.display = 'none';
    uploadPreview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function clearFilePreview() {
  state.selectedFile = null;
  fileInput.value = '';
  previewImg.src = '';
  uploadPlaceholder.style.display = 'block';
  uploadPreview.style.display = 'none';
}

// ── 20. Submissão do formulário ──────────────────────────────
uploadForm && uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const originalBtnText = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '⏳ Enviando…';
  uploadProgress.style.display = 'block';
  setProgress(10, 'Preparando upload…');

  try {
    // 20.1 Gerar nome único para o arquivo
    const ext      = state.selectedFile.type === 'image/webp' ? 'webp' : 'png';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path     = `${STORAGE_FOLDER}/${filename}`;

    setProgress(30, 'Enviando imagem…');

    // 20.2 Upload para o Supabase Storage
    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(path, state.selectedFile, {
        contentType: state.selectedFile.type,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    setProgress(65, 'Obtendo URL pública…');

    // 20.3 Obter URL pública
    const { data: urlData } = db.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    const imageUrl = urlData.publicUrl;

    setProgress(80, 'Salvando no banco de dados…');

    // 20.4 Inserir registro na tabela stickers
    const { error: dbError } = await db
      .from('stickers')
      .insert([{
        category:  categorySelect.value,
        title:     titleInput.value.trim()   || null,
        caption:   captionInput.value.trim() || null,
        image_url: imageUrl,
        status:    'public',
      }]);

    if (dbError) throw dbError;

    setProgress(100, 'Concluído!');

    showToast('🎉 Figurinha enviada com sucesso! Ela já aparece na galeria.', 'success', 5000);
    closeModal();
    await loadStickers();

  } catch (err) {
    console.error('[Upload] Erro:', err);
    showToast(`❌ Erro ao enviar: ${err?.message || err}`, 'error', 8000);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalBtnText; // ✅ restaura o texto original do botão
    uploadProgress.style.display = 'none';
    setProgress(0, '');
  }
});

// ── 21. Inputs de filtro/busca ───────────────────────────────
searchInput && searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value || '';
  applyFilters();
});
categoryFilter && categoryFilter.addEventListener('change', (e) => {
  state.categoryFilter = e.target.value || '';
  applyFilters();
});
sortSelect && sortSelect.addEventListener('change', (e) => {
  state.sortOrder = e.target.value || 'newest';
  applyFilters();
});

// ── 22. Helpers/Utilitários ──────────────────────────────────
function setProgress(percent, text) {
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (progressText) progressText.textContent = text || '';
}

function resetForm() {
  clearFilePreview();
  if (categorySelect) categorySelect.value = ''; // reset para "Selecione uma categoria..."
  if (titleInput) titleInput.value = '';
  if (captionInput) captionInput.value = '';
  if (codeInput) codeInput.value = '';
  clearFieldError('fileError');
  clearFieldError('categoryError');
  clearFieldError('codeError');
}

function validateForm() {
  let ok = true;

  // Valida imagem
  if (!state.selectedFile) {
    showFieldError('fileError', 'Escolha uma imagem PNG ou WebP antes de enviar.');
    ok = false;
  } else {
    clearFieldError('fileError');
  }

  // Valida categoria
  if (!categorySelect || !categorySelect.value) {
    showFieldError('categoryError', 'Selecione uma categoria.');
    ok = false;
  } else {
    clearFieldError('categoryError');
  }

  // ✅ CORRIGIDO: Valida o Código da Comunidade
  const enteredCode = codeInput ? codeInput.value.trim() : '';
  if (!enteredCode) {
    showFieldError('codeError', 'Digite o código da comunidade.');
    ok = false;
  } else if (enteredCode !== COMMUNITY_CODE) {
    showFieldError('codeError', '❌ Código incorreto. Verifique e tente novamente.');
    ok = false;
  } else {
    clearFieldError('codeError');
  }

  return ok;
}

function showFieldError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
function clearFieldError(id) {
  const el = $(id);
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

function sanitizeFilename(name) {
  return String(name || 'figurinha')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'figurinha';
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll('\n', ' ').replaceAll('\r', ' ');
}

// ── 23. Boot ────────────────────────────────────────────────
(function boot() {
  populateCategorySelects();
  loadStickers();
})();

