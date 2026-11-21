import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  VORTICER_CATEGORIES,
  getCategoryMeta,
  parsePriceString,
  formatTarifarioPrice
} from '../data/initialProducts';
import { supabase } from '../lib/supabase';
import { uploadProductImageToSupabase } from '../utils/uploadImage';

export default function AdminServicesPanel({
  products,
  setProducts,
  refreshProducts,
  loadingProducts
}) {
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showSecondVariant, setShowSecondVariant] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState(null);

  // Estado para edición rápida de precios en línea
  const [inlinePriceMap, setInlinePriceMap] = useState({});

  // Estado para ajuste porcentual masivo
  const [bulkPct, setBulkPct] = useState('');
  const [bulkCategory, setBulkCategory] = useState('all');
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);

  // Formulario de alta / edición
  const [formData, setFormData] = useState({
    categoria: 'marketing',
    mostrar_en_catalogo: false,
    nombre: '',
    medidas: '',
    precio1: '',
    descripcion1: '',
    precio2: '',
    descripcion2: '',
    foto: ''
  });

  const fileInputRef = useRef(null);
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

  const activeFormCatMeta = getCategoryMeta(formData.categoria);

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const publicUrl = await uploadProductImageToSupabase(file, formData.categoria);
      setFormData((prev) => ({
        ...prev,
        foto: publicUrl,
        mostrar_en_catalogo: true
      }));
      triggerFeedback('Imagen optimizada y guardada en la nube.');
    } catch (err) {
      console.error('Error al subir imagen a Supabase Storage:', err);
      alert('No se pudo subir la imagen.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({ ...prev, [name]: checked }));
      return;
    }
    if (name === 'categoria') {
      setFormData((prev) => ({
        ...prev,
        categoria: value,
        mostrar_en_catalogo: value === 'merchandising' ? true : prev.mostrar_en_catalogo
      }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setShowSecondVariant(false);
    setFormData({
      categoria: selectedCategoryFilter !== 'all' ? selectedCategoryFilter : 'marketing',
      mostrar_en_catalogo: selectedCategoryFilter === 'merchandising',
      nombre: '',
      medidas: '',
      precio1: '',
      descripcion1: '',
      precio2: '',
      descripcion2: '',
      foto: ''
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const payload = {
        categoria: formData.categoria,
        mostrar_en_catalogo: Boolean(formData.mostrar_en_catalogo),
        nombre: formData.nombre.trim(),
        medidas: formData.medidas.trim(),
        precio1: formData.precio1.trim(),
        descripcion1: formData.descripcion1.trim(),
        precio2: showSecondVariant ? formData.precio2.trim() : '',
        descripcion2: showSecondVariant ? formData.descripcion2.trim() : '',
        foto: formData.foto
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('productos')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setProducts((prev) => prev.map((item) => (item.id === editingId ? data : item)));
          triggerFeedback(`"${data.nombre}" actualizado correctamente.`);
        }
      } else {
        const nextOrder = products.length;
        const { data, error } = await supabase
          .from('productos')
          .insert({ ...payload, orden: nextOrder })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setProducts((prev) => [...prev, data]);
          triggerFeedback(`"${data.nombre}" agregado a Servicios y Precios.`);
        }
      }

      resetForm();
    } catch (err) {
      console.error('Error al guardar servicio/producto:', err);
      triggerFeedback('Ocurrió un error al guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setShowSecondVariant(Boolean(item.precio2 || item.descripcion2));
    setFormData({
      categoria: item.categoria || 'merchandising',
      mostrar_en_catalogo: item.mostrar_en_catalogo !== false,
      nombre: item.nombre || '',
      medidas: item.medidas || '',
      precio1: item.precio1 || '',
      descripcion1: item.descripcion1 || '',
      precio2: item.precio2 || '',
      descripcion2: item.descripcion2 || '',
      foto: item.foto || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`¿Eliminar "${item.nombre}" del tarifario y catálogo?`)) {
      return;
    }
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== item.id));
    if (editingId === item.id) {
      resetForm();
    }
    const { error } = await supabase.from('productos').delete().eq('id', item.id);
    if (error) {
      console.error('Error al eliminar servicio:', error);
      setProducts(previous);
      triggerFeedback('No se pudo eliminar el servicio.');
    } else {
      triggerFeedback(`"${item.nombre}" eliminado.`);
    }
  };

  // Edición rápida de precio en la fila
  const handleInlinePriceChange = (id, field, value) => {
    setInlinePriceMap((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveInlinePrice = async (item) => {
    const edits = inlinePriceMap[item.id];
    if (!edits) return;

    const newPrecio1 = edits.precio1 !== undefined ? edits.precio1 : item.precio1;
    const newPrecio2 = edits.precio2 !== undefined ? edits.precio2 : item.precio2;

    const { data, error } = await supabase
      .from('productos')
      .update({ precio1: newPrecio1, precio2: newPrecio2 })
      .eq('id', item.id)
      .select()
      .single();

    if (error) {
      console.error('Error al actualizar precio rápido:', error);
      triggerFeedback('No se pudo actualizar el precio.');
      return;
    }

    if (data) {
      setProducts((prev) => prev.map((p) => (p.id === item.id ? data : p)));
      setInlinePriceMap((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      triggerFeedback(`Precio de "${item.nombre}" actualizado.`);
    }
  };

  // Ajuste masivo por porcentaje
  const handleApplyBulkPercentage = async (e) => {
    e.preventDefault();
    const pct = parseFloat(bulkPct);
    if (isNaN(pct) || pct === 0 || isApplyingBulk) return;

    const targets = products.filter(
      (p) => bulkCategory === 'all' || (p.categoria || 'merchandising') === bulkCategory
    );
    if (targets.length === 0) return;

    setIsApplyingBulk(true);
    try {
      const factor = 1 + pct / 100;
      const results = await Promise.all(
        targets.map((item) => {
          const p1Num = parsePriceString(item.precio1);
          const p2Num = parsePriceString(item.precio2);
          const updatedP1 = p1Num > 0 ? formatTarifarioPrice(p1Num * factor) : item.precio1;
          const updatedP2 = p2Num > 0 ? formatTarifarioPrice(p2Num * factor) : item.precio2;
          return supabase
            .from('productos')
            .update({ precio1: updatedP1, precio2: updatedP2 })
            .eq('id', item.id);
        })
      );

      const failed = results.filter((r) => r.error);
      if (typeof refreshProducts === 'function') {
        await refreshProducts();
      }
      setBulkPct('');
      if (failed.length > 0) {
        console.error('Errores en actualización masiva:', failed.map((f) => f.error));
        triggerFeedback(`Se actualizaron parcialmente los precios (${failed.length} fallaron).`);
      } else {
        triggerFeedback(
          `Precios actualizados (${pct > 0 ? `+${pct}%` : `${pct}%`}) en ${targets.length} ítems.`
        );
      }
    } catch (err) {
      console.error('Error en actualización masiva:', err);
      triggerFeedback('No se pudieron actualizar los precios.');
    } finally {
      setIsApplyingBulk(false);
    }
  };

  // Filtrado de lista
  const filteredProducts = products.filter((item) => {
    const cat = item.categoria || 'merchandising';
    const matchesCat = selectedCategoryFilter === 'all' || cat === selectedCategoryFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      (item.nombre || '').toLowerCase().includes(q) ||
      (item.descripcion1 || '').toLowerCase().includes(q) ||
      (item.descripcion2 || '').toLowerCase().includes(q) ||
      (item.medidas || '').toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  return (
    <div className="flex-1 bg-[#111827] p-5 sm:p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Encabezado limpio y directo */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 shadow-md">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-1.5 h-5 rounded-full bg-vorticer-gradient" />
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[#F7F9FC]">
                Servicios, Productos y Tarifario Oficial
              </h1>
            </div>
            <p className="text-xs text-[#94A3B8] mt-1">
              Cargá aquí los servicios de cada rubro. Lo que esté en esta lista es lo que el equipo podrá cotizar en los Presupuestos.
            </p>
          </div>

          {/* Herramienta de actualización porcentual masiva bien alineada */}
          <form
            onSubmit={handleApplyBulkPercentage}
            className="flex flex-wrap items-center gap-2.5 bg-[#111827] border border-gray-700 rounded-xl p-3"
          >
            <span className="text-xs font-semibold text-[#94A3B8]">
              Actualizar precios por %:
            </span>
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#F7F9FC] focus:outline-none focus:border-[#7BCBFF]"
            >
              <option value="all">Todos los rubros</option>
              {VORTICER_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortLabel}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.5"
              value={bulkPct}
              onChange={(e) => setBulkPct(e.target.value)}
              placeholder="Ej: 15"
              className="w-24 text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF]"
            />
            <button
              type="submit"
              disabled={isApplyingBulk || !bulkPct}
              className="px-3.5 py-2 rounded-lg bg-[#6A5CFF] hover:bg-[#6A5CFF]/90 disabled:opacity-40 text-[#F7F9FC] text-xs font-semibold transition cursor-pointer whitespace-nowrap"
            >
              {isApplyingBulk ? 'Aplicando...' : 'Aplicar aumento'}
            </button>
          </form>
        </div>

        {statusFeedback && (
          <div className="bg-[#374151] border border-[#7BCBFF]/40 text-[#F7F9FC] px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#7BCBFF]" />
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUMNA IZQUIERDA (4 cols): FORMULARIO DE ALTA / EDICIÓN SIMPLIFICADO */}
          <div className="lg:col-span-4 bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-4 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-vorticer-gradient" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#F7F9FC]">
                  {editingId ? 'Editar Servicio / Producto' : 'Agregar Servicio o Producto'}
                </h2>
              </div>
              {editingId && (
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-[#6A5CFF]/25 text-[#7BCBFF]">
                  Editando
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Selector de Categoría */}
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1">
                  Rubro / Área *
                </label>
                <select
                  name="categoria"
                  value={formData.categoria}
                  onChange={handleInputChange}
                  className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#7BCBFF] font-bold focus:outline-none focus:border-[#7BCBFF]"
                >
                  {VORTICER_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nombre y Medidas/Modalidad */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#94A3B8] mb-1">
                    Nombre del Servicio o Producto *
                  </label>
                  <input
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    placeholder="Ej: GESTIÓN DE REDES SOCIALES"
                    className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 font-bold focus:outline-none focus:border-[#7BCBFF]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#94A3B8] mb-1">
                    {activeFormCatMeta.unitFieldLabel} (Opcional)
                  </label>
                  <input
                    type="text"
                    name="medidas"
                    value={formData.medidas}
                    onChange={handleInputChange}
                    placeholder={activeFormCatMeta.unitPlaceholder}
                    className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 font-semibold focus:outline-none focus:border-[#7BCBFF]"
                  />
                </div>
              </div>

              {/* Precio y Descripción Principal */}
              <div className="p-3.5 bg-[#111827] rounded-xl border border-gray-700/80 space-y-3">
                <div>
                  <label className="block text-xs text-[#94A3B8] mb-1">
                    Precio *
                  </label>
                  <input
                    type="text"
                    name="precio1"
                    value={formData.precio1}
                    onChange={handleInputChange}
                    placeholder="Ej: $280.000"
                    className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#7BCBFF] font-bold focus:outline-none focus:border-[#7BCBFF]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#94A3B8] mb-1">
                    Descripción / Qué incluye
                  </label>
                  <textarea
                    name="descripcion1"
                    value={formData.descripcion1}
                    onChange={handleInputChange}
                    rows={2}
                    placeholder="Detalle que saldrá impreso en el presupuesto..."
                    className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF]"
                  />
                </div>
              </div>

              {/* Segunda Variante Desplegable (Solo si el usuario la necesita) */}
              {!showSecondVariant ? (
                <button
                  type="button"
                  onClick={() => setShowSecondVariant(true)}
                  className="w-full py-2 px-3 rounded-xl border border-dashed border-gray-700 hover:border-[#7BCBFF] text-xs font-semibold text-[#7BCBFF] transition cursor-pointer"
                >
                  + Agregar 2da opción de precio (Ej: Plan Full / Lona Mate)
                </button>
              ) : (
                <div className="p-3.5 bg-[#111827] rounded-xl border border-[#7BCBFF]/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#7BCBFF]">
                      2da Opción (Opcional)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSecondVariant(false);
                        setFormData((prev) => ({ ...prev, precio2: '', descripcion2: '' }));
                      }}
                      className="text-[11px] text-red-400 hover:underline cursor-pointer"
                    >
                      Quitar 2da opción
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">
                      Precio 2da Opción
                    </label>
                    <input
                      type="text"
                      name="precio2"
                      value={formData.precio2}
                      onChange={handleInputChange}
                      placeholder="Ej: $420.000"
                      className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#7BCBFF] font-bold focus:outline-none focus:border-[#7BCBFF]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1">
                      Descripción 2da Opción
                    </label>
                    <textarea
                      name="descripcion2"
                      value={formData.descripcion2}
                      onChange={handleInputChange}
                      rows={2}
                      placeholder="Detalle de la segunda variante..."
                      className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF]"
                    />
                  </div>
                </div>
              )}

              {/* Imagen opcional y visibilidad en Catálogo */}
              <div className="p-3.5 bg-[#111827] rounded-xl border border-gray-700/80 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="mostrar_en_catalogo"
                    checked={formData.mostrar_en_catalogo}
                    onChange={handleInputChange}
                    className="w-4 h-4 rounded accent-[#6A5CFF]"
                  />
                  <span className="text-xs font-medium text-[#F7F9FC]">
                    Incluir también en el Catálogo visual con foto
                  </span>
                </label>

                {formData.mostrar_en_catalogo && (
                  <div className="flex items-center gap-3 pt-1">
                    {formData.foto ? (
                      <div className="relative w-14 h-14 bg-[#1F2A37] rounded-lg border border-[#7BCBFF]/40 p-1 overflow-hidden group flex-shrink-0">
                        <img
                          src={formData.foto}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, foto: '' }))}
                          className="absolute inset-0 bg-[#111827]/85 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <label className="px-3.5 py-2 border border-dashed border-gray-700 hover:border-[#7BCBFF] rounded-lg cursor-pointer bg-[#1F2A37] text-xs text-[#7BCBFF] font-semibold transition flex-shrink-0">
                        {isUploadingImage ? 'Subiendo foto...' : '+ Subir foto'}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          disabled={isUploadingImage}
                          onChange={handleImageChange}
                          className="hidden"
                        />
                      </label>
                    )}

                    <input
                      type="text"
                      name="foto"
                      value={formData.foto}
                      onChange={handleInputChange}
                      placeholder="o pegar link de imagen..."
                      className="flex-1 text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF]"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-vorticer-gradient hover:opacity-95 text-[#F7F9FC] text-xs font-bold py-3 px-4 rounded-xl shadow-lg shadow-[#6A5CFF]/25 transition cursor-pointer"
                >
                  {isSaving
                    ? 'Guardando...'
                    : editingId
                    ? 'Guardar Cambios'
                    : 'Guardar Servicio'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-[#374151] hover:bg-[#374151]/80 text-[#F7F9FC] text-xs font-semibold py-3 px-4 rounded-xl border border-gray-700 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* COLUMNA DERECHA (8 cols): LISTADO DE SERVICIOS Y EDICIÓN RÁPIDA DE PRECIOS */}
          <div className="lg:col-span-8 bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-4 shadow-md">
            {/* Pestañas de Categoría + Buscador */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-700/80 pb-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('all')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    selectedCategoryFilter === 'all'
                      ? 'bg-vorticer-gradient text-[#F7F9FC] shadow-sm'
                      : 'bg-[#111827] text-[#94A3B8] hover:text-[#F7F9FC] border border-gray-700'
                  }`}
                >
                  Todos ({products.length})
                </button>
                {VORTICER_CATEGORIES.map((cat) => {
                  const count = products.filter(
                    (p) => (p.categoria || 'merchandising') === cat.id
                  ).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryFilter(cat.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        selectedCategoryFilter === cat.id
                          ? 'bg-vorticer-gradient text-[#F7F9FC] shadow-sm'
                          : 'bg-[#111827] text-[#94A3B8] hover:text-[#F7F9FC] border border-gray-700'
                      }`}
                    >
                      {cat.shortLabel} ({count})
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar servicio o producto..."
                className="w-full sm:w-56 text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF]"
              />
            </div>

            {/* Listado limpio y alineado */}
            {loadingProducts ? (
              <div className="py-12 text-center text-xs text-[#94A3B8]">
                Cargando servicios y precios...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#94A3B8] bg-[#111827] rounded-xl border border-dashed border-gray-700">
                No hay servicios en este rubro. Podés agregarlos desde el formulario izquierdo.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProducts.map((item) => {
                  const catMeta = getCategoryMeta(item.categoria || 'merchandising');
                  const inlineEdits = inlinePriceMap[item.id] || {};
                  const currentP1 =
                    inlineEdits.precio1 !== undefined ? inlineEdits.precio1 : item.precio1 || '';
                  const currentP2 =
                    inlineEdits.precio2 !== undefined ? inlineEdits.precio2 : item.precio2 || '';
                  const hasSecondOption = Boolean(item.precio2 || item.descripcion2);
                  const hasUnsavedInline =
                    inlineEdits.precio1 !== undefined || inlineEdits.precio2 !== undefined;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border transition ${
                        editingId === item.id
                          ? 'bg-[#374151] border-[#7BCBFF]'
                          : 'bg-[#111827] border-gray-700/80 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#6A5CFF]/20 text-[#7BCBFF] border border-[#6A5CFF]/40">
                              {catMeta.shortLabel}
                            </span>
                            {item.mostrar_en_catalogo && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#1F2A37] text-[#94A3B8] border border-gray-700">
                                En Catálogo
                              </span>
                            )}
                            <h3 className="text-sm font-extrabold text-[#F7F9FC]">
                              {item.nombre}
                            </h3>
                            {item.medidas && (
                              <span className="text-xs font-semibold text-[#7BCBFF]">
                                ({item.medidas})
                              </span>
                            )}
                          </div>

                          {item.descripcion1 && (
                            <p className="text-xs text-[#94A3B8] leading-relaxed">
                              {hasSecondOption && (
                                <strong className="text-[#F7F9FC]/80">Opción 1: </strong>
                              )}
                              {item.descripcion1}
                            </p>
                          )}
                          {item.descripcion2 && (
                            <p className="text-xs text-[#94A3B8] leading-relaxed">
                              <strong className="text-[#F7F9FC]/80">Opción 2: </strong>
                              {item.descripcion2}
                            </p>
                          )}
                        </div>

                        {/* Controles de precio y acciones perfectamente alineados en el eje central */}
                        <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={currentP1}
                              onChange={(e) =>
                                handleInlinePriceChange(item.id, 'precio1', e.target.value)
                              }
                              placeholder="$0"
                              title="Editar precio rápido"
                              className="w-32 text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#7BCBFF] font-bold focus:outline-none focus:border-[#7BCBFF]"
                            />

                            {hasSecondOption && (
                              <input
                                type="text"
                                value={currentP2}
                                onChange={(e) =>
                                  handleInlinePriceChange(item.id, 'precio2', e.target.value)
                                }
                                placeholder="Precio 2"
                                title="Editar segundo precio"
                                className="w-32 text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#7BCBFF] font-bold focus:outline-none focus:border-[#7BCBFF]"
                              />
                            )}
                          </div>

                          {hasUnsavedInline && (
                            <button
                              type="button"
                              onClick={() => handleSaveInlinePrice(item)}
                              className="px-3 py-2 rounded-lg bg-vorticer-gradient text-[#F7F9FC] text-xs font-bold shadow cursor-pointer whitespace-nowrap"
                            >
                              Guardar
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="px-3 py-2 rounded-lg bg-[#1F2A37] hover:bg-[#374151] text-[#F7F9FC] border border-gray-700 text-xs font-semibold transition cursor-pointer"
                            title="Editar servicio completo"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="p-2 rounded-lg bg-[#1F2A37] hover:bg-red-500/20 text-red-400 border border-gray-700 transition cursor-pointer"
                            title="Eliminar servicio"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
