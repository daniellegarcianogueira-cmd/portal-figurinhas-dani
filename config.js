// ============================================================
//  config.js – Bonequinhas da Dani
//  ATENÇÃO: substitua os valores abaixo com os dados reais
//  do seu projeto Supabase antes de publicar no GitHub Pages.
// ============================================================

const SUPABASE_URL  = 'https://unajvsjvqskdfxlyicll.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_o0oHhdabn3IJiYABpS7zFw__oGRWw4b';

// Código secreto que as alunas precisam digitar para enviar figurinhas.
// Troque para o código que você quiser usar na sua comunidade.
const COMMUNITY_CODE = 'DMF2026';

// Nome do bucket criado no Supabase Storage
const STORAGE_BUCKET = 'stickers';

// Tamanho máximo de upload em bytes (4 MB)
const MAX_FILE_SIZE = 4 * 1024 * 1024;

// Categorias disponíveis no formulário
const CATEGORIES = [
  'Motivação',
  'Humor',
  'Carinho',
  'Estudo',
  'Fé',
  'Saúde',
  'Moda',
  'Geral',
];
