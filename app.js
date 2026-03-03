// ============================================================
//  app.js – Bonequinhas da Dani
//  Lógica principal: Supabase, upload, galeria, clipboard,
//  compartilhamento, PWA, service worker.
//  Sem bibliotecas externas além do Supabase SDK.
// ============================================================

'use strict';

// ── 1. Inicialização do Supabase ─────────────────────────────
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

const grid           = $('stickersGrid');
const loadingSpinner = $('loadingSpinner');
const stickerCount   = $('stickerCount');
const searchInput    = $('searchInput');
const categoryFilter = $('categoryFilter');
const sortSelect     = $('sortSelect');
const modalOverlay   = $('modalOverlay');
const btnOpenModal   = $('btnOpenModal');
const btnCloseModal  = $('btnCloseModal');
const uploadForm     = $('uploadForm');
const fileInput      = $('fileInput');
const uploadArea     = $('uploadArea');
const uploadPlaceholder = $('uploadPlaceholder');
const uploadPreview  = $('uploadPreview');
const previewImg     = $('previewImg');
const btnRemovePreview = $('btnRemovePreview');
const categorySelect = $('categorySelect');
const titleInput     = $('titleInput');
const captionInput   = $('captionInput');
const codeInput      = $('codeInput');
const btnSubmit      = $('btnSubmit');
const uploadProgress = $('uploadProgress');
const progressBar    = $('progressBar');
const progressText   = $('progressText');
const lightbox       = $('lightbox');
const lightboxImg    = $('lightboxImg');
const lightboxClose  = $('lightboxClose');
const toastContainer = $('toastContainer');
const offlineBanner  = $('offlineBanner');

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
  if (!navigator.onLine) {
    offlineBanner.classList.add('show');
  } else {
    offlineBanner.classList.remove('show');
  }
}
window.addEventListener('online',  updateOnlineStatus);
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
    const { data, error } = await supabase
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
      (s.title   || '').toLowerCase().includes(q) ||
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
  state.filtered.forEach((sticker) => {
    fragment.appendChild(createCard(sticker));
  });
  grid.appendChild(fragment);
}

function renderEmpty(message) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <div class="empty-icon">🎀</div>
    <h3>Nenhuma figurinha aqui</h3>
    <p>${message}</p>
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

  const title   = escapeHtml(sticker.title   || '');
  const caption = escapeHtml(sticker.caption || '');
  const category = escapeHtml(sticker.category || '');
  const imgUrl  = sticker.image_url;

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
      ${title   ? `<p class="card-title">${title}</p>` : ''}
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
  const title   = btn.dataset.title   || 'Figurinha';
  const caption = btn.dataset.caption || '';

  switch (action) {
    case 'copy-sticker':  await copySticker(url, btn);  break;
    case 'copy-caption':  copyCaption(caption);          break;
    case 'save':          saveImage(url, title);         break;
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
      canvas.width  = img.naturalWidth;
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
    ta.style.opacity  = '0';
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
    const ext  = blob.type === 'image/webp' ? 'webp' : 'png';
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${sanitizeFilename(title)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    showToast('💾 Figurinha salva!', 'success');
  } catch (err) {
    console.error('[Save]', err);
    // Fallback: abre em nova aba
    window.open(url, '_blank', 'noopener');
    showToast('Abrindo imagem em nova aba para salvar manualmente.', 'info');
  }
}

// ── 16. Compartilhar ─────────────────────────────────────────
async function shareSticker(url, title, caption) {
  if (navigator.share) {
    try {
      // Tenta compartilhar o arquivo diretamente
      const response = await fetch(url);
      const blob = await response.blob();
      const ext  = blob.type === 'image/webp' ? 'webp' : 'png';
      const file = new File([blob], `${sanitizeFilename(title || 'figurinha')}.${ext}`, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: title || 'Figurinha Bonequinhas da Dani',
          text: caption || 'Confira essa figurinha! 🎀',
          files: [file],
        });
      } else {
        // Compartilha só o link
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
    // Fallback: copia URL
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

// ── 18. Modal ─────────────────────────────────────────────────
function openModal() {
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  codeInput.focus();
}

function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
  resetForm();
}

btnOpenModal.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// Abre modal via URL param ?action=add
if (new URLSearchParams(location.search).get('action') === 'add') {
  setTimeout(openModal, 500);
}

// ── 19. Upload: drag & drop e preview ────────────────────────
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

btnRemovePreview.addEventListener('click', (e) => {
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
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '⏳ Enviando…';
  uploadProgress.style.display = 'block';
  setProgress(10, 'Preparando upload…');

  try {
    // 20.1 Gerar nome único para o arquivo
    const ext      = state.selectedFile.type === 'image/webp' ? 'webp' : 'png';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path     = `public/${filename}`;

    setProgress(30, 'Enviando imagem…');

    // 20.2 Upload para o Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, state.selectedFile, {
        contentType: state.selectedFile.type,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    setProgress(65, 'Obtendo URL pública…');

    // 20.3 Obter URL pública
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    const imageUrl = urlData.publicUrl;

    setProgress(80, 'Salvando no banco de dados…');

    // 20.4 Inserir registro na tabela stickers
    const { error: dbError } = await supabase
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

    // Recarrega a galeria
    await loadStickers();

  } catch (err) {
    console.error('[Upload] Erro:', err);
    let msg = 'Erro ao enviar figurinha. Tente novamente.';
    if (err.message?.includes('Bucket not found')) {
      msg = 'Bucket "stickers" não encontrado. Verifique a configuração do Supabase.';
    } else if (err.message?.includes('row-level security')) {
      msg = 'Permissão negada. Verifique as policies RLS no Supabase.';
    } else if (err.message?.includes('duplicate')) {
      msg = 'Já existe um arquivo com esse nome. Tente novamente.';
    }
    showToast(msg, 'error', 7000);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '🚀 Enviar Figurinha';
    uploadProgress.style.display = 'none';
    setProgress(0, '');
  }
});

function setProgress(percent, text) {
  progressBar.style.width = `${percent}%`;
  progressText.textContent = text;
}

// ── 21. Validação do formulário ──────────────────────────────
function validateForm() {
  let valid = true;

  // Arquivo
  if (!state.selectedFile) {
    showFieldError('fileError', 'Selecione uma imagem PNG ou WebP.');
    valid = false;
  } else {
    clearFieldError('fileError');
  }

  // Categoria
  if (!categorySelect.value) {
    showFieldError('categoryError', 'Selecione uma categoria.');
    categorySelect.classList.add('error');
    valid = false;
  } else {
    clearFieldError('categoryError');
    categorySelect.classList.remove('error');
  }

  // Código da comunidade
  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    showFieldError('codeError', 'Digite o código da comunidade.');
    codeInput.classList.add('error');
    valid = false;
  } else if (code !== COMMUNITY_CODE.toUpperCase()) {
    showFieldError('codeError', '❌ Código incorreto. Verifique com a Dani.');
    codeInput.classList.add('error');
    valid = false;
  } else {
    clearFieldError('codeError');
    codeInput.classList.remove('error');
  }

  return valid;
}

function showFieldError(id, msg) {
  const el = $(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearFieldError(id) {
  const el = $(id);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function resetForm() {
  uploadForm.reset();
  clearFilePreview();
  clearFieldError('fileError');
  clearFieldError('categoryError');
  clearFieldError('codeError');
  categorySelect.classList.remove('error');
  codeInput.classList.remove('error');
  state.selectedFile = null;
}

// ── 22. Eventos de busca e filtros ───────────────────────────
let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.searchQuery = searchInput.value.trim();
    applyFilters();
  }, 300);
});

categoryFilter.addEventListener('change', () => {
  state.categoryFilter = categoryFilter.value;
  applyFilters();
});

sortSelect.addEventListener('change', () => {
  state.sortOrder = sortSelect.value;
  applyFilters();
});

// ── 23. Utilitários ──────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function sanitizeFilename(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 50) || 'figurinha';
}

// ── 24. Inicialização ────────────────────────────────────────
function init() {
  populateCategorySelects();
  loadStickers();
}

document.addEventListener('DOMContentLoaded', init);
