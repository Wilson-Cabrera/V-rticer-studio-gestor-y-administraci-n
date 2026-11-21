export const VORTICER_CATEGORIES = [
  {
    id: 'merchandising',
    label: 'Cartelería y Merchandising',
    shortLabel: 'Cartelería / Merch',
    unitFieldLabel: 'Medidas',
    unitPlaceholder: 'Ej: 90x190 cm',
    pdfSubtitle: 'CARTELERÍA Y MERCHANDISING'
  },
  {
    id: 'marketing',
    label: 'Marketing y Redes Sociales',
    shortLabel: 'Marketing y Redes',
    unitFieldLabel: 'Modalidad / Frecuencia',
    unitPlaceholder: 'Ej: Plan Mensual',
    pdfSubtitle: 'MARKETING Y REDES SOCIALES'
  },
  {
    id: 'branding',
    label: 'Diseño, Identidad y Rebranding',
    shortLabel: 'Identidad y Rebranding',
    unitFieldLabel: 'Alcance / Plazo',
    unitPlaceholder: 'Ej: Entrega 15 días',
    pdfSubtitle: 'DISEÑO, IDENTIDAD Y REBRANDING'
  },
  {
    id: 'web',
    label: 'Desarrollo Web y Base de Datos',
    shortLabel: 'Web y Sistemas',
    unitFieldLabel: 'Modalidad de Proyecto',
    unitPlaceholder: 'Ej: Proyecto a medida',
    pdfSubtitle: 'DESARROLLO WEB Y SISTEMAS'
  }
];

export function getCategoryMeta(categoryId) {
  return (
    VORTICER_CATEGORIES.find((c) => c.id === categoryId) || VORTICER_CATEGORIES[0]
  );
}

// Datos iniciales de respaldo
export const INITIAL_PRODUCTS = [
  {
    id: 'prod-1',
    categoria: 'merchandising',
    mostrar_en_catalogo: true,
    nombre: 'DOBLE TENSOR',
    medidas: '90x190 cm',
    precio1: '$158.760',
    descripcion1: 'Incluye lonafront BRILLANTE, bolsillos, y bolsa para transportar.',
    precio2: '$174.123',
    descripcion2: 'Incluye lona blackout MATE, bolsillos, y bolsa para transportar.',
    foto: '/doble-tensor.png'
  },
  {
    id: 'prod-2',
    categoria: 'merchandising',
    mostrar_en_catalogo: true,
    nombre: 'ROLLUP',
    medidas: '85x200 cm',
    precio1: '$183.263',
    descripcion1: 'Incluye lonafront BRILLANTE, armado, y bolsa para transportar.',
    precio2: '$198.536',
    descripcion2: 'Incluye lona blackout MATE, armado, y bolsa para transportar.',
    foto: '/rollup.png'
  }
];

/**
 * Convierte un string de precio (ej. "$158.760" o "158760,50") en número flotante
 */
export function parsePriceString(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  const raw = String(priceStr).replace(/[^0-9.,-]/g, '');
  // Si tiene un solo punto con 1 o 2 decimales y sin comas (ej. "1500.50"), tratar el punto como decimal
  if (!raw.includes(',') && /^\-?\d+\.\d{1,2}$/.test(raw)) {
    const num = parseFloat(raw);
    return isNaN(num) ? 0 : num;
  }
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Formatea un número en moneda ARS (ej. $158.760 o $158.760,00)
 */
export function formatCurrencyARS(amount, decimals = 2) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

/**
 * Formatea un número entero con formato de precio de tarifario (ej. "$158.760")
 */
export function formatTarifarioPrice(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num <= 0) return '';
  return '$' + num.toLocaleString('es-AR');
}
