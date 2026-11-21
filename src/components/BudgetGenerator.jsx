import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  VORTICER_CATEGORIES,
  getCategoryMeta,
  parsePriceString,
  formatCurrencyARS
} from '../data/initialProducts';
import { supabase } from '../lib/supabase';

const DEFAULT_CONDITIONS =
  'Presupuesto válido por 15 días. Forma de pago: 50% anticipo, 50% contra entrega.';

/**
 * Estima la altura visual en píxeles de una fila de ítem en la tabla A4
 */
function estimateItemHeight(item) {
  const text = (item.descripcion || '').trim();
  const lines = Math.max(1, Math.ceil(text.length / 50));
  return 26 + lines * 18;
}

/**
 * Divide los ítems del presupuesto en páginas A4 para que nunca se corte la tabla
 * ni el cuadro de totales al final del documento.
 */
function paginateBudgetItems(items) {
  if (!items || items.length === 0) {
    return [[]];
  }

  const PAGE1_WITH_TOTALS_MAX = 350;
  const PAGE1_WITHOUT_TOTALS_MAX = 490;
  const NEXT_WITH_TOTALS_MAX = 440;
  const NEXT_WITHOUT_TOTALS_MAX = 580;

  const totalHeight = items.reduce((sum, item) => sum + estimateItemHeight(item), 0);

  if (totalHeight <= PAGE1_WITH_TOTALS_MAX) {
    return [items];
  }

  const pages = [];
  const remaining = [...items];
  let pageIndex = 0;

  while (remaining.length > 0) {
    const isFirstPage = pageIndex === 0;
    const maxWithTotals = isFirstPage ? PAGE1_WITH_TOTALS_MAX : NEXT_WITH_TOTALS_MAX;
    const maxWithoutTotals = isFirstPage ? PAGE1_WITHOUT_TOTALS_MAX : NEXT_WITHOUT_TOTALS_MAX;

    const remHeight = remaining.reduce((sum, it) => sum + estimateItemHeight(it), 0);

    if (remHeight <= maxWithTotals) {
      pages.push([...remaining]);
      break;
    }

    const currentPageItems = [];
    let currentHeight = 0;

    while (remaining.length > 1) {
      const nextItemHeight = estimateItemHeight(remaining[0]);
      if (currentPageItems.length > 0 && currentHeight + nextItemHeight > maxWithoutTotals) {
        break;
      }
      currentPageItems.push(remaining.shift());
      currentHeight += nextItemHeight;
    }

    // Evitar bucle infinito si queda 1 solo ítem cuya altura estimada supera maxWithTotals
    if (currentPageItems.length === 0 && remaining.length > 0) {
      currentPageItems.push(remaining.shift());
    }

    pages.push(currentPageItems);
    pageIndex++;
  }

  return pages;
}

function formatBudgetNum(num) {
  const n = Math.max(1, parseInt(num, 10) || 1);
  return String(n).padStart(4, '0');
}

function parseBudgetNum(str) {
  const raw = String(str || '').trim();
  if (!raw) return 0;
  // Si viene con prefijo histórico (ej. "PRE-2606-0002"), tomamos solo el último bloque numérico
  const parts = raw.split('-');
  const lastSegment = parts[parts.length - 1] || raw;
  const cleaned = lastSegment.replace(/\D/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : Math.max(0, n);
}

export default function BudgetGenerator({
  products,
  previewScale,
  printComponentRef,
  onBudgetExportedRef,
  onGoToAdmin
}) {
  const todayISO = new Date().toISOString().slice(0, 10);

  // Categoría activa del presupuesto
  const [budgetCategory, setBudgetCategory] = useState('marketing');
  const [savedBudgetsCategoryFilter, setSavedBudgetsCategoryFilter] = useState('all');

  // Inicializar con el último índice conocido en localStorage mientras responde Supabase
  const [minAllowedNumber, setMinAllowedNumber] = useState(() => {
    const savedLast = parseInt(localStorage.getItem('vorticer_last_budget_num') || '0', 10) || 0;
    return savedLast + 1;
  });

  const [budgetNumber, setBudgetNumber] = useState(() => {
    const savedLast = parseInt(localStorage.getItem('vorticer_last_budget_num') || '0', 10) || 0;
    return formatBudgetNum(savedLast + 1);
  });

  const [selectedClientId, setSelectedClientId] = useState(null);

  const [client, setClient] = useState({
    empresa: '',
    contacto: '',
    email: '',
    telefono: '',
    fecha: todayISO,
    direccion: '',
    notasInternas: ''
  });

  const [items, setItems] = useState([]);

  const [condiciones, setCondiciones] = useState(DEFAULT_CONDITIONS);
  const [ivaPct, setIvaPct] = useState(21);
  const [descuentoPct, setDescuentoPct] = useState(0);

  const [savedClients, setSavedClients] = useState([]);
  const [savedBudgets, setSavedBudgets] = useState([]);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  const [showSavedBudgetsModal, setShowSavedBudgetsModal] = useState(false);
  const [showCatalogPicker, setShowCatalogPicker] = useState(true);
  const [serviceSearch, setServiceSearch] = useState('');
  const [statusFeedback, setStatusFeedback] = useState(null);
  const [savedCurrentBudgetId, setSavedCurrentBudgetId] = useState(null);
  const feedbackTimerRef = useRef(null);

  const triggerFeedback = useCallback((msg) => {
    setStatusFeedback(msg);
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => {
      setStatusFeedback(null);
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Avanza de forma monotónica (nunca retrocede) el contador en Supabase y en localStorage
  const commitAndAdvanceCounter = useCallback(async (usedNumberInt) => {
    const safeUsed = Math.max(1, usedNumberInt);
    const localLast = parseInt(localStorage.getItem('vorticer_last_budget_num') || '0', 10) || 0;
    const newHighest = Math.max(localLast, safeUsed);
    localStorage.setItem('vorticer_last_budget_num', String(newHighest));

    let nextNumber = newHighest + 1;

    try {
      const { data: rpcNext, error } = await supabase.rpc(
        'registrar_y_avanzar_numero_presupuesto',
        { p_numero_usado: newHighest }
      );
      if (!error && typeof rpcNext === 'number') {
        nextNumber = Math.max(nextNumber, rpcNext);
        localStorage.setItem('vorticer_last_budget_num', String(nextNumber - 1));
      }
    } catch (err) {
      console.error('Error al actualizar contador en Supabase:', err);
    }

    setMinAllowedNumber(nextNumber);
    setBudgetNumber(formatBudgetNum(nextNumber));
    return nextNumber;
  }, []);

  // Cargar clientes, presupuestos y el contador persistente desde Supabase
  const loadSupabaseData = useCallback(async () => {
    try {
      const [
        { data: clientsData },
        { data: budgetsData },
        { data: configData }
      ] = await Promise.all([
        supabase.from('clientes').select('*').order('created_at', { ascending: false }),
        supabase.from('presupuestos').select('*').order('created_at', { ascending: false }),
        supabase.from('configuracion_sistema').select('*').eq('id', 'default').maybeSingle()
      ]);

      if (clientsData) {
        setSavedClients(clientsData);
      }
      if (budgetsData) {
        setSavedBudgets(budgetsData);
      }

      const fromConfig = configData?.ultimo_numero_presupuesto || 0;
      const fromBudgets = (budgetsData || []).reduce((max, b) => {
        const parsed = parseBudgetNum(b.numero);
        return parsed > max ? parsed : max;
      }, 0);

      // Supabase es la fuente de verdad del correlativo para evitar valores corruptos en localStorage
      const highestUsed = Math.max(fromConfig, fromBudgets);
      localStorage.setItem('vorticer_last_budget_num', String(highestUsed));

      if (highestUsed > fromConfig) {
        await supabase.rpc('registrar_y_avanzar_numero_presupuesto', {
          p_numero_usado: highestUsed
        });
      }

      const nextAvailable = highestUsed + 1;
      setMinAllowedNumber(nextAvailable);
      setBudgetNumber(formatBudgetNum(nextAvailable));
      setSavedCurrentBudgetId(null);
    } catch (err) {
      console.error('Error al cargar datos de Supabase:', err);
    }
  }, []);

  useEffect(() => {
    loadSupabaseData();
  }, [loadSupabaseData]);

  // Cálculos de totales
  const subtotal = items.reduce(
    (acc, item) => acc + (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0),
    0
  );
  const descuentoMonto = subtotal * (Math.max(0, Number(descuentoPct) || 0) / 100);
  const baseImponible = Math.max(0, subtotal - descuentoMonto);
  const ivaMonto = baseImponible * (Math.max(0, Number(ivaPct) || 0) / 100);
  const totalFinal = baseImponible + ivaMonto;

  // Exponer funciones al botón superior "Descargar Presupuesto PDF"
  useEffect(() => {
    if (!onBudgetExportedRef) return;
    onBudgetExportedRef.current = {
      getCurrentNumber: () => budgetNumber,
      advanceAfterExport: async () => {
        const usedNumInt = Math.max(minAllowedNumber, parseBudgetNum(budgetNumber));
        const formattedUsed = formatBudgetNum(usedNumInt);
        const clientName = client.empresa.trim() || client.contacto.trim() || 'Consumidor Final';

        try {
          const payload = {
            numero: formattedUsed,
            categoria: budgetCategory,
            titulo: `#${formattedUsed} - ${clientName}`,
            cliente_id: selectedClientId || null,
            cliente_snapshot: client,
            fecha_emision: client.fecha || todayISO,
            items,
            notas: condiciones,
            subtotal,
            iva_porcentaje: Number(ivaPct) || 0,
            descuento_porcentaje: Number(descuentoPct) || 0,
            monto_total: totalFinal,
            estado: 'exportado'
          };

          if (savedCurrentBudgetId) {
            const { data, error } = await supabase
              .from('presupuestos')
              .update(payload)
              .eq('id', savedCurrentBudgetId)
              .select()
              .single();

            if (error) throw error;
            if (data) {
              setSavedBudgets((prev) =>
                prev.map((b) => (b.id === savedCurrentBudgetId ? data : b))
              );
            }
          } else {
            const { data, error } = await supabase
              .from('presupuestos')
              .insert(payload)
              .select()
              .single();

            if (error) throw error;
            if (data) {
              setSavedBudgets((prev) => [data, ...prev]);
            }
          }
        } catch (err) {
          console.error('Error al registrar presupuesto exportado:', err);
        }

        const nextNum = await commitAndAdvanceCounter(usedNumInt);
        setSavedCurrentBudgetId(null);
        triggerFeedback(
          `Presupuesto #${formattedUsed} descargado. Próximo número correlativo: #${formatBudgetNum(nextNum)}.`
        );
      }
    };
  }, [
    onBudgetExportedRef,
    budgetNumber,
    budgetCategory,
    minAllowedNumber,
    client,
    selectedClientId,
    savedCurrentBudgetId,
    todayISO,
    items,
    condiciones,
    subtotal,
    ivaPct,
    descuentoPct,
    totalFinal,
    commitAndAdvanceCounter,
    triggerFeedback
  ]);

  const handleClientChange = (e) => {
    const { name, value } = e.target;
    setClient((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveClient = async () => {
    const label = client.empresa.trim() || client.contacto.trim();
    if (!label || isSavingClient) {
      triggerFeedback('Ingresa al menos el nombre de la empresa o del contacto para guardar el cliente.');
      return;
    }

    setIsSavingClient(true);
    try {
      const payload = {
        nombre_empresa: client.empresa.trim(),
        contacto_nombre: client.contacto.trim(),
        email: client.email.trim(),
        telefono: client.telefono.trim(),
        direccion: client.direccion.trim(),
        notas: client.notasInternas.trim()
      };

      const { data, error } = await supabase
        .from('clientes')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setSavedClients((prev) => [data, ...prev]);
        setSelectedClientId(data.id);
        triggerFeedback(`Cliente "${label}" guardado.`);
      }
    } catch (err) {
      console.error('Error al guardar cliente:', err);
      triggerFeedback('No se pudo guardar el cliente.');
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleSelectSavedClient = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) {
      setSelectedClientId(null);
      return;
    }
    const found = savedClients.find((c) => c.id === selectedId);
    if (found) {
      setSelectedClientId(found.id);
      setClient({
        empresa: found.nombre_empresa || '',
        contacto: found.contacto_nombre || '',
        email: found.email || '',
        telefono: found.telefono || '',
        fecha: client.fecha || todayISO,
        direccion: found.direccion || '',
        notasInternas: found.notas || ''
      });
      const label = found.nombre_empresa || found.contacto_nombre || 'Cliente';
      triggerFeedback(`Cliente "${label}" seleccionado.`);
    }
  };

  // Agregar ítem desde Servicios y Precios
  const handleAddProductVariant = (prod, variantNumber) => {
    const rawPrice = variantNumber === 1 ? prod.precio1 : prod.precio2;
    const rawDesc = variantNumber === 1 ? prod.descripcion1 : prod.descripcion2;
    const unitPrice = parsePriceString(rawPrice);
    const fullDescription = [
      `${prod.nombre}${prod.medidas ? ` (${prod.medidas})` : ''}`,
      rawDesc ? `— ${rawDesc}` : ''
    ]
      .filter(Boolean)
      .join(' ');

    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productoId: prod.id,
        categoria: prod.categoria || 'merchandising',
        descripcion: fullDescription,
        cantidad: 1,
        precioUnitario: unitPrice
      }
    ]);
    triggerFeedback(`"${prod.nombre}" agregado al presupuesto.`);
  };

  const handleItemQuantityChange = (id, value) => {
    const qty = Math.max(1, Number(value) || 1);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, cantidad: qty } : item))
    );
  };

  const handleRemoveItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveBudget = async () => {
    if (isSavingBudget) return;
    if (items.length === 0) {
      triggerFeedback('Agregá al menos un ítem antes de guardar el presupuesto.');
      return;
    }

    setIsSavingBudget(true);
    try {
      const usedNumInt = Math.max(minAllowedNumber, parseBudgetNum(budgetNumber));
      const formattedUsed = formatBudgetNum(usedNumInt);
      const clientName = client.empresa.trim() || client.contacto.trim() || 'Consumidor Final';

      const payload = {
        numero: formattedUsed,
        categoria: budgetCategory,
        titulo: `#${formattedUsed} - ${clientName}`,
        cliente_id: selectedClientId || null,
        cliente_snapshot: client,
        fecha_emision: client.fecha || todayISO,
        items,
        notas: condiciones,
        subtotal,
        iva_porcentaje: Number(ivaPct) || 0,
        descuento_porcentaje: Number(descuentoPct) || 0,
        monto_total: totalFinal,
        estado: 'emitido'
      };

      if (savedCurrentBudgetId) {
        const { data, error } = await supabase
          .from('presupuestos')
          .update(payload)
          .eq('id', savedCurrentBudgetId)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setSavedBudgets((prev) =>
            prev.map((b) => (b.id === savedCurrentBudgetId ? data : b))
          );
        }
        triggerFeedback(
          `Presupuesto #${formattedUsed} actualizado en el historial. Ya podés descargar el PDF con este mismo número.`
        );
      } else {
        const { data, error } = await supabase
          .from('presupuestos')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        if (data) {
          setSavedBudgets((prev) => [data, ...prev]);
          setSavedCurrentBudgetId(data.id);
        }

        triggerFeedback(
          `Presupuesto #${formattedUsed} guardado en el historial. Al descargar el PDF se usará este mismo número.`
        );
      }
    } catch (err) {
      console.error('Error al guardar presupuesto:', err);
      triggerFeedback('No se pudo guardar el presupuesto.');
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleLoadBudget = (entry) => {
    if (entry.categoria) {
      setBudgetCategory(entry.categoria);
    }
    setSelectedClientId(entry.cliente_id || null);
    if (entry.cliente_snapshot && Object.keys(entry.cliente_snapshot).length > 0) {
      setClient({
        empresa: entry.cliente_snapshot.empresa || '',
        contacto: entry.cliente_snapshot.contacto || '',
        email: entry.cliente_snapshot.email || '',
        telefono: entry.cliente_snapshot.telefono || '',
        fecha: entry.fecha_emision || entry.cliente_snapshot.fecha || todayISO,
        direccion: entry.cliente_snapshot.direccion || '',
        notasInternas: entry.cliente_snapshot.notasInternas || ''
      });
    }
    setItems(Array.isArray(entry.items) ? entry.items : []);
    setCondiciones(entry.notas ?? DEFAULT_CONDITIONS);
    setIvaPct(entry.iva_porcentaje ?? 21);
    setDescuentoPct(entry.descuento_porcentaje ?? 0);
    setShowSavedBudgetsModal(false);
    triggerFeedback(
      `Se cargaron los datos de "${entry.titulo}" (manteniendo el número actual #${budgetNumber}).`
    );
  };

  const handleDeleteSavedBudget = async (id) => {
    if (!window.confirm('¿Eliminar este presupuesto del historial? Esta acción no se puede deshacer.')) {
      return;
    }
    const previous = savedBudgets;
    setSavedBudgets((prev) => prev.filter((b) => b.id !== id));
    if (savedCurrentBudgetId === id) {
      setSavedCurrentBudgetId(null);
    }
    const { error } = await supabase.from('presupuestos').delete().eq('id', id);
    if (error) {
      console.error('Error al eliminar presupuesto:', error);
      setSavedBudgets(previous);
      triggerFeedback('No se pudo eliminar el presupuesto.');
    } else {
      triggerFeedback('Presupuesto eliminado del historial.');
    }
  };

  const formatDisplayDate = (isoDate) => {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const activeCategoryMeta = getCategoryMeta(budgetCategory);
  const pickerProducts = products.filter((p) => {
    const sameCat = (p.categoria || 'merchandising') === budgetCategory;
    if (!sameCat) return false;
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.descripcion1 || '').toLowerCase().includes(q) ||
      (p.medidas || '').toLowerCase().includes(q)
    );
  });

  const filteredSavedBudgets = savedBudgets.filter(
    (b) =>
      savedBudgetsCategoryFilter === 'all' ||
      (b.categoria || 'merchandising') === savedBudgetsCategoryFilter
  );

  // Paginación inteligente de ítems en múltiples hojas A4
  const pages = paginateBudgetItems(items);

  return (
    <div className="flex-1 flex flex-col xl:flex-row overflow-hidden bg-[#111827]">
      {/* ================================================================= */}
      {/* PANEL IZQUIERDO: FLUJO DE UNA SOLA COLUMNA AMPLIA Y CLARA         */}
      {/* ================================================================= */}
      <div className="no-print w-full xl:w-[560px] 2xl:w-[620px] bg-[#111827] border-r border-gray-700/70 flex flex-col h-auto xl:h-[calc(100vh-69px)] overflow-y-auto p-5 sm:p-6 space-y-5">
        {statusFeedback && (
          <div className="bg-[#374151] border border-[#7BCBFF]/40 text-[#F7F9FC] px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#7BCBFF] flex-shrink-0" />
              <span>{statusFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="text-[#7BCBFF] hover:text-[#F7F9FC] ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* PASO 1: ÁREA / RUBRO DEL PRESUPUESTO */}
        <section className="bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-3.5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-vorticer-gradient text-[#F7F9FC] text-[11px] font-extrabold flex items-center justify-center">
                1
              </span>
              <h2 className="text-xs font-bold tracking-wider uppercase text-[#F7F9FC]">
                Rubro del Presupuesto
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#111827] border border-gray-700 text-[#7BCBFF]">
                Presupuesto #{budgetNumber}
              </span>
              <button
                type="button"
                onClick={() => setShowSavedBudgetsModal((prev) => !prev)}
                className="text-xs font-semibold px-3 py-1 rounded-lg bg-[#374151] hover:bg-[#374151]/80 text-[#F7F9FC] border border-gray-700 transition cursor-pointer"
              >
                {showSavedBudgetsModal ? 'Cerrar Historial' : `Historial (${savedBudgets.length})`}
              </button>
            </div>
          </div>

          {/* Historial desplegable si el usuario toca "Historial" */}
          {showSavedBudgetsModal && (
            <div className="p-3.5 rounded-xl bg-[#374151] border border-gray-700 space-y-2.5 max-h-64 overflow-y-auto shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#F7F9FC]">
                  Presupuestos guardados anteriormente
                </span>
                <select
                  value={savedBudgetsCategoryFilter}
                  onChange={(e) => setSavedBudgetsCategoryFilter(e.target.value)}
                  className="text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-2.5 py-1 text-[#F7F9FC] focus:outline-none focus:border-[#7BCBFF]"
                >
                  <option value="all">Todos los rubros ({savedBudgets.length})</option>
                  {VORTICER_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shortLabel}
                    </option>
                  ))}
                </select>
              </div>

              {filteredSavedBudgets.length === 0 ? (
                <p className="text-xs text-[#94A3B8] text-center py-3">
                  Todavía no hay presupuestos guardados en este rubro.
                </p>
              ) : (
                filteredSavedBudgets.map((b) => {
                  const bCat = getCategoryMeta(b.categoria || 'merchandising');
                  return (
                    <div
                      key={b.id}
                      className="p-2.5 rounded-lg bg-[#1F2A37] border border-gray-700 flex items-center justify-between gap-3 text-xs hover:border-[#7BCBFF]/50 transition"
                    >
                      <div
                        onClick={() => handleLoadBudget(b)}
                        className="flex-1 cursor-pointer min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#6A5CFF]/25 text-[#7BCBFF] flex-shrink-0">
                            {bCat.shortLabel}
                          </span>
                          <span className="font-bold text-[#F7F9FC] truncate">
                            {b.titulo}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#94A3B8] mt-0.5">
                          {b.created_at
                            ? new Date(b.created_at).toLocaleDateString('es-AR')
                            : ''}{' '}
                          ·{' '}
                          <span className="text-[#7BCBFF] font-semibold">
                            {formatCurrencyARS(b.monto_total, 0)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedBudget(b.id)}
                        className="text-red-400 hover:text-red-300 px-2 py-1 cursor-pointer"
                        title="Eliminar del historial"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Grilla 2x2 cómoda para elegir el rubro sin que se corte ningún texto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VORTICER_CATEGORIES.map((cat) => {
              const isSelected = budgetCategory === cat.id;
              const catCount = products.filter(
                (p) => (p.categoria || 'merchandising') === cat.id
              ).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setBudgetCategory(cat.id)}
                  className={`px-3.5 py-2.5 rounded-xl text-left transition cursor-pointer border flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-vorticer-gradient text-[#F7F9FC] border-transparent shadow-md shadow-[#6A5CFF]/20'
                      : 'bg-[#111827] text-[#94A3B8] hover:text-[#F7F9FC] border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold block truncate">{cat.shortLabel}</span>
                    <span
                      className={`text-[10px] block ${
                        isSelected ? 'text-[#F7F9FC]/85' : 'text-[#7BCBFF]'
                      }`}
                    >
                      {catCount} {catCount === 1 ? 'opción cargada' : 'opciones cargadas'}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-[#F7F9FC] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* PASO 2: DATOS DEL CLIENTE */}
        <section className="bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-4 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-vorticer-gradient text-[#F7F9FC] text-[11px] font-extrabold flex items-center justify-center">
                2
              </span>
              <h2 className="text-xs font-bold tracking-wider uppercase text-[#F7F9FC]">
                Datos del Cliente
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {savedClients.length > 0 && (
                <select
                  onChange={handleSelectSavedClient}
                  value={selectedClientId || ''}
                  className="text-xs bg-[#374151] border border-gray-700 rounded-lg px-3 py-1.5 text-[#F7F9FC] focus:outline-none focus:border-[#7BCBFF]"
                >
                  <option value="">Elegir cliente frecuente ({savedClients.length})...</option>
                  {savedClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_empresa || c.contacto_nombre || 'Cliente'}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={handleSaveClient}
                disabled={isSavingClient}
                className="flex items-center gap-1.5 bg-[#374151] hover:bg-[#6A5CFF] text-[#F7F9FC] border border-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap"
              >
                <span>{isSavingClient ? 'Guardando...' : '+ Guardar cliente'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Empresa o Marca</label>
              <input
                type="text"
                name="empresa"
                value={client.empresa}
                onChange={handleClientChange}
                placeholder="Ej: Vórticer S.A."
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Persona de Contacto</label>
              <input
                type="text"
                name="contacto"
                value={client.contacto}
                onChange={handleClientChange}
                placeholder="Ej: Juan Pérez"
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Teléfono / WhatsApp</label>
              <input
                type="text"
                name="telefono"
                value={client.telefono}
                onChange={handleClientChange}
                placeholder="+54 9 299 ..."
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={client.email}
                onChange={handleClientChange}
                placeholder="cliente@email.com"
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Fecha de Emisión</label>
              <input
                type="date"
                name="fecha"
                value={client.fecha}
                onChange={handleClientChange}
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Dirección / Localidad</label>
              <input
                type="text"
                name="direccion"
                value={client.direccion}
                onChange={handleClientChange}
                placeholder="Opcional"
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>
          </div>
        </section>

        {/* PASO 3: SERVICIOS Y PRODUCTOS DEL PRESUPUESTO */}
        <section className="bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-4 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-vorticer-gradient text-[#F7F9FC] text-[11px] font-extrabold flex items-center justify-center">
                3
              </span>
              <h2 className="text-xs font-bold tracking-wider uppercase text-[#F7F9FC]">
                Ítems a Cotizar ({items.length})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {typeof onGoToAdmin === 'function' && (
                <button
                  type="button"
                  onClick={onGoToAdmin}
                  className="text-xs font-semibold text-[#7BCBFF] hover:underline cursor-pointer"
                >
                  + Crear nuevo servicio
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCatalogPicker((prev) => !prev)}
                className="bg-[#374151] hover:bg-[#374151]/80 text-[#F7F9FC] border border-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                {showCatalogPicker ? 'Ocultar lista' : 'Mostrar lista de servicios'}
              </button>
            </div>
          </div>

          {/* Lista de servicios de la categoría actual para agregar con 1 clic */}
          {showCatalogPicker && (
            <div className="bg-[#111827] border border-gray-700 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#94A3B8]">
                  Opciones disponibles en{' '}
                  <strong className="text-[#7BCBFF]">{activeCategoryMeta.shortLabel}</strong>:
                </span>
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Filtrar por nombre..."
                  className="text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-1.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] w-full sm:w-48"
                />
              </div>

              {pickerProducts.length === 0 ? (
                <div className="text-xs text-[#94A3B8] py-4 text-center bg-[#1F2A37] rounded-lg border border-gray-700">
                  No se encontraron servicios en esta categoría.{' '}
                  {typeof onGoToAdmin === 'function' && (
                    <button
                      type="button"
                      onClick={onGoToAdmin}
                      className="text-[#7BCBFF] font-semibold underline ml-1 cursor-pointer"
                    >
                      Cargar en Servicios y Precios
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {pickerProducts.map((prod) => {
                    const hasTwoOptions = Boolean(prod.precio1 && prod.precio2);
                    return (
                      <div
                        key={prod.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-[#1F2A37] border border-gray-700/90 hover:border-gray-600 text-xs transition"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[#F7F9FC]">
                            {prod.nombre}{' '}
                            {prod.medidas && (
                              <span className="text-[#7BCBFF] font-semibold">
                                ({prod.medidas})
                              </span>
                            )}
                          </div>
                          {prod.descripcion1 && (
                            <p className="text-[11px] text-[#94A3B8] line-clamp-1 mt-0.5">
                              {prod.descripcion1}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                          {prod.precio1 && (
                            <button
                              type="button"
                              onClick={() => handleAddProductVariant(prod, 1)}
                              className="px-3 py-1.5 rounded-lg bg-[#6A5CFF] hover:bg-[#6A5CFF]/90 text-[#F7F9FC] text-xs font-semibold transition cursor-pointer whitespace-nowrap shadow-sm"
                            >
                              {hasTwoOptions
                                ? `+ Opción 1 (${prod.precio1})`
                                : `+ Agregar (${prod.precio1})`}
                            </button>
                          )}
                          {prod.precio2 && (
                            <button
                              type="button"
                              onClick={() => handleAddProductVariant(prod, 2)}
                              className="px-3 py-1.5 rounded-lg bg-[#374151] hover:bg-[#374151]/80 text-[#7BCBFF] border border-[#7BCBFF]/40 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                            >
                              + Opción 2 ({prod.precio2})
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Ítems ya agregados al presupuesto actual */}
          <div className="space-y-2.5 pt-1">
            {items.length === 0 ? (
              <div className="text-center py-6 bg-[#111827]/60 rounded-xl border border-dashed border-gray-700 text-xs text-[#94A3B8]">
                Todavía no agregaste ítems. Haz clic en <strong>+ Agregar</strong> sobre cualquier servicio de la lista superior.
              </div>
            ) : (
              <>
                <div className="hidden sm:grid sm:grid-cols-12 gap-3 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] px-2">
                  <div className="col-span-6">Detalle en el presupuesto</div>
                  <div className="col-span-2 text-center">Cant.</div>
                  <div className="col-span-4 text-right pr-8">Subtotal</div>
                </div>

                {items.map((item) => {
                  const rowSubtotal =
                    (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0);
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-[#111827] p-3 rounded-xl border border-gray-700/80"
                    >
                      <div className="sm:col-span-6">
                        <div className="text-xs text-[#F7F9FC] font-medium leading-snug">
                          {item.descripcion}
                        </div>
                        <div className="text-[11px] text-[#94A3B8] mt-0.5">
                          Unitario: {formatCurrencyARS(item.precioUnitario, 0)}
                        </div>
                      </div>

                      <div className="sm:col-span-2 flex items-center justify-start sm:justify-center">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.cantidad}
                          onChange={(e) =>
                            handleItemQuantityChange(item.id, e.target.value)
                          }
                          className="w-20 text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-2.5 py-2 text-[#F7F9FC] text-center font-bold focus:outline-none focus:border-[#7BCBFF]"
                        />
                      </div>

                      <div className="sm:col-span-4 flex items-center justify-between sm:justify-end gap-3">
                        <span className="text-sm font-bold text-[#7BCBFF] whitespace-nowrap">
                          {formatCurrencyARS(rowSubtotal, 0)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="w-8 h-8 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 transition cursor-pointer"
                          title="Quitar ítem"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </section>

        {/* PASO 4: CONDICIONES, IMPUESTOS Y TOTAL */}
        <section className="bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-4 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-vorticer-gradient text-[#F7F9FC] text-[11px] font-extrabold flex items-center justify-center">
              4
            </span>
            <h2 className="text-xs font-bold tracking-wider uppercase text-[#F7F9FC]">
              Condiciones y Resumen Total
            </h2>
          </div>

          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">
              Validez, plazos y forma de pago (se imprime al pie del PDF)
            </label>
            <textarea
              rows={2}
              value={condiciones}
              onChange={(e) => setCondiciones(e.target.value)}
              placeholder="Ej: Presupuesto válido por 15 días. Forma de pago: 50% anticipo, 50% contra entrega."
              className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl p-3 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">IVA (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={ivaPct}
                onChange={(e) => setIvaPct(e.target.value)}
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] font-bold focus:outline-none focus:border-[#7BCBFF]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Descuento (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={descuentoPct}
                onChange={(e) => setDescuentoPct(e.target.value)}
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] font-bold focus:outline-none focus:border-[#7BCBFF]"
              />
            </div>
          </div>

          <div className="bg-[#111827] border border-gray-700/90 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#94A3B8]">
              <span>Subtotal</span>
              <span className="font-bold text-[#F7F9FC]">{formatCurrencyARS(subtotal, 2)}</span>
            </div>

            {Number(descuentoPct) > 0 && (
              <div className="flex items-center justify-between text-rose-400">
                <span>Descuento ({descuentoPct}%)</span>
                <span className="font-bold">-{formatCurrencyARS(descuentoMonto, 2)}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[#94A3B8]">
              <span>IVA ({ivaPct}%)</span>
              <span className="font-bold text-[#F7F9FC]">{formatCurrencyARS(ivaMonto, 2)}</span>
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-gray-700">
              <span className="text-sm font-extrabold text-[#F7F9FC]">Total Presupuesto</span>
              <span className="text-xl font-black text-vorticer-gradient">
                {formatCurrencyARS(totalFinal, 2)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveBudget}
            disabled={isSavingBudget}
            className="w-full py-3 px-4 rounded-xl bg-[#374151] hover:bg-[#6A5CFF] text-[#F7F9FC] border border-gray-600 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <svg className="w-4 h-4 text-[#7BCBFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
              />
            </svg>
            <span>
              {isSavingBudget
                ? 'Guardando presupuesto...'
                : 'Guardar Presupuesto en el Historial'}
            </span>
          </button>
        </section>
      </div>

      {/* ================================================================= */}
      {/* PANEL DERECHO: VISTA PREVIA A4 MULTIPÁGINA VÓRTICER STUDIO         */}
      {/* ================================================================= */}
      <div className="flex-1 bg-[#111827] overflow-auto p-4 md:p-8 flex flex-col items-center justify-start">
        <div className="no-print w-full max-w-[794px] mb-4 flex items-center justify-between text-xs text-[#94A3B8]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#7BCBFF]" />
            <span>
              Vista previa Hoja A4 — Presupuesto #{budgetNumber} ({activeCategoryMeta.shortLabel})
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1F2A37] border border-gray-700 text-[#7BCBFF] font-semibold">
            {pages.length} {pages.length === 1 ? 'Página' : 'Páginas'}
          </span>
        </div>

        <div
          style={{
            transform: `scale(${previewScale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
          className="flex flex-col gap-10 items-center"
        >
          <div ref={printComponentRef} className="print-root flex flex-col gap-10">
            {pages.map((pageItems, pageIdx) => {
              const isFirstPage = pageIdx === 0;
              const isLastPage = pageIdx === pages.length - 1;

              return (
                <div
                  key={`budget-page-${pageIdx}`}
                  className="a4-sheet w-[794px] h-[1123px] bg-[#F7F9FC] text-[#1F2A37] shadow-2xl relative flex flex-col justify-between overflow-hidden font-['Inter',sans-serif] select-none"
                  style={{ boxSizing: 'border-box' }}
                >
                  {/* 1. ENCABEZADO OFICIAL VÓRTICER STUDIO */}
                  <header className="w-full bg-black flex items-center justify-center p-0 flex-shrink-0">
                    <img
                      src="/logo.png"
                      alt="Vórticer Studio"
                      className="h-[180px] w-auto object-contain mx-auto select-none"
                    />
                  </header>

                  {/* 2. CUERPO DEL PRESUPUESTO A4 */}
                  <main className="flex-1 px-12 py-7 flex flex-col justify-between overflow-hidden">
                    <div className="space-y-5">
                      {/* Cabecera Documental: Categoría, Título, Número, Fecha y Paginación */}
                      <div className="flex items-start justify-between border-b-2 border-[#1F2A37] pb-4">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-widest text-[#6A5CFF] block">
                            COTIZACIÓN COMERCIAL · {activeCategoryMeta.pdfSubtitle}
                            {pages.length > 1 ? ` · HOJA ${pageIdx + 1} DE ${pages.length}` : ''}
                          </span>
                          <h1 className="text-[26px] font-black text-[#1F2A37] tracking-tight uppercase leading-none mt-1">
                            PRESUPUESTO #{budgetNumber || '0001'}
                          </h1>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block">
                            Fecha de Emisión
                          </span>
                          <span className="text-[15px] font-extrabold text-[#1F2A37]">
                            {formatDisplayDate(client.fecha)}
                          </span>
                        </div>
                      </div>

                      {/* Datos del Cliente: Tarjeta completa en Hoja 1, Resumen compacto en Hojas 2+ */}
                      {isFirstPage ? (
                        <div className="bg-white border border-gray-200 rounded-2xl p-4 grid grid-cols-2 gap-4 text-xs shadow-sm">
                          <div className="space-y-1.5">
                            <div>
                              <span className="text-gray-400 font-semibold uppercase text-[10px] block">
                                Cliente / Empresa
                              </span>
                              <span className="text-sm font-extrabold text-[#1F2A37]">
                                {client.empresa || client.contacto || 'Consumidor Final'}
                              </span>
                            </div>
                            {client.contacto && client.empresa && (
                              <div>
                                <span className="text-gray-400 font-semibold uppercase text-[10px] block">
                                  Contacto
                                </span>
                                <span className="font-semibold text-gray-700">{client.contacto}</span>
                              </div>
                            )}
                            {client.direccion && (
                              <div>
                                <span className="text-gray-400 font-semibold uppercase text-[10px] block">
                                  Dirección
                                </span>
                                <span className="font-medium text-gray-700">{client.direccion}</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5 text-right">
                            {client.telefono && (
                              <div>
                                <span className="text-gray-400 font-semibold uppercase text-[10px] block">
                                  Teléfono
                                </span>
                                <span className="font-semibold text-gray-700">{client.telefono}</span>
                              </div>
                            )}
                            {client.email && (
                              <div>
                                <span className="text-gray-400 font-semibold uppercase text-[10px] block">
                                  Email
                                </span>
                                <span className="font-medium text-gray-700">{client.email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs shadow-sm">
                          <div>
                            <span className="text-gray-400 font-semibold uppercase text-[10px] mr-2">
                              Cliente:
                            </span>
                            <span className="font-extrabold text-[#1F2A37]">
                              {client.empresa || client.contacto || 'Consumidor Final'}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-gray-500">
                            Continuación de ítems — Hoja {pageIdx + 1} de {pages.length}
                          </span>
                        </div>
                      )}

                      {/* Tabla de Ítems de esta página */}
                      <div>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-[#1F2A37] text-[#F7F9FC] text-[11px] font-bold uppercase tracking-wider">
                              <th className="py-2.5 px-4 text-left rounded-tl-xl">
                                Descripción del Servicio / Producto
                              </th>
                              <th className="py-2.5 px-3 text-center w-20">Cant.</th>
                              <th className="py-2.5 px-4 text-right w-32">Precio Unit.</th>
                              <th className="py-2.5 px-4 text-right w-36 rounded-tr-xl">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 text-[12.5px]">
                            {pageItems.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-gray-400 italic bg-white">
                                  Selecciona los servicios a cotizar desde el panel izquierdo.
                                </td>
                              </tr>
                            ) : (
                              pageItems.map((item, idx) => {
                                const rowTotal =
                                  (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0);
                                return (
                                  <tr
                                    key={item.id}
                                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-100/70'}
                                  >
                                    <td className="py-3 px-4 font-semibold text-[#1F2A37] leading-snug">
                                      {item.descripcion || 'Ítem sin descripción'}
                                    </td>
                                    <td className="py-3 px-3 text-center font-bold text-gray-700">
                                      {item.cantidad}
                                    </td>
                                    <td className="py-3 px-4 text-right font-medium text-gray-700">
                                      {formatCurrencyARS(item.precioUnitario, 0)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-extrabold text-[#1F2A37]">
                                      {formatCurrencyARS(rowTotal, 0)}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Parte inferior del cuerpo */}
                    {isLastPage ? (
                      <div className="grid grid-cols-12 gap-8 items-end pt-5 border-t border-gray-200">
                        <div className="col-span-7">
                          {condiciones && (
                            <div className="bg-white border border-gray-200/90 rounded-xl p-4 shadow-sm">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#1F2A37] block mb-1">
                                Notas y Condiciones Comerciales
                              </span>
                              <p className="text-[11.5px] text-gray-600 leading-relaxed whitespace-pre-line">
                                {condiciones}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="col-span-5 bg-white border border-gray-200 rounded-2xl p-4 space-y-2 shadow-sm">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span className="font-semibold">Subtotal</span>
                            <span className="font-bold text-[#1F2A37]">
                              {formatCurrencyARS(subtotal, 2)}
                            </span>
                          </div>

                          {Number(descuentoPct) > 0 && (
                            <div className="flex justify-between text-xs text-rose-600">
                              <span className="font-semibold">Descuento ({descuentoPct}%)</span>
                              <span className="font-bold">
                                -{formatCurrencyARS(descuentoMonto, 2)}
                              </span>
                            </div>
                          )}

                          {Number(ivaPct) > 0 && (
                            <div className="flex justify-between text-xs text-gray-600">
                              <span className="font-semibold">IVA ({ivaPct}%)</span>
                              <span className="font-bold text-[#1F2A37]">
                                {formatCurrencyARS(ivaMonto, 2)}
                              </span>
                            </div>
                          )}

                          <div className="border-t border-gray-300 pt-2.5 flex justify-between items-baseline">
                            <span className="text-sm font-black uppercase text-[#1F2A37]">
                              Total
                            </span>
                            <span className="text-[23px] font-black text-[#6A5CFF] leading-none">
                              {formatCurrencyARS(totalFinal, 2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-dashed border-gray-300 flex items-center justify-between text-xs text-gray-500">
                        <span className="font-medium italic">
                          El detalle de ítems y el resumen total continúan en la Hoja {pageIdx + 2}...
                        </span>
                        <span className="font-bold text-[#6A5CFF]">
                          Hoja {pageIdx + 1} de {pages.length} →
                        </span>
                      </div>
                    )}
                  </main>

                  {/* 3. PIE DE PÁGINA OFICIAL VÓRTICER STUDIO */}
                  <footer className="w-full pb-7 pt-4 px-10 text-center border-t border-gray-200/70 mt-auto flex-shrink-0">
                    <p className="text-[12px] text-gray-600 font-semibold tracking-wide">
                      Vórticer Studio | Precio + IVA | +54 9 299 462-1939 | vorticerstudio@gmail.com
                    </p>
                  </footer>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
