import React, { useState, useRef, useMemo } from 'react';
import {
  INITIAL_PRODUCTS,
  VORTICER_CATEGORIES,
  getCategoryMeta
} from '../data/initialProducts';
import { supabase } from '../lib/supabase';
import { uploadProductImageToSupabase } from '../utils/uploadImage';

export default function CatalogGenerator({
  products,
  setProducts,
  refreshProducts,
  loadingProducts,
  previewScale,
  printComponentRef,
  onGoToAdmin
}) {
  const [selectedCategory, setSelectedCategory] = useState('merchandising');
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Formulario reactivo
  const [formData, setFormData] = useState({
    categoria: 'merchandising',
    nombre: '',
    medidas: '',
    precio1: '',
    descripcion1: '',
    precio2: '',
    descripcion2: '',
    foto: ''
  });

  const fileInputRef = useRef(null);

  // Filtrar productos por categoría seleccionada y que estén marcados para mostrarse en el catálogo
  const filteredCatalogProducts = useMemo(() => {
    return products.filter(
      (p) =>
        (p.categoria || 'merchandising') === selectedCategory &&
        p.mostrar_en_catalogo !== false
    );
  }, [products, selectedCategory]);

  const currentCatMeta = useMemo(
    () => getCategoryMeta(selectedCategory),
    [selectedCategory]
  );

  // Optimización y subida automática a Supabase Storage (bucket `vorticer-imagenes`)
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const publicUrl = await uploadProductImageToSupabase(
        file,
        formData.categoria || selectedCategory
      );
      setFormData((prev) => ({ ...prev, foto: publicUrl }));
    } catch (err) {
      console.error('Error al subir imagen a Supabase Storage:', err);
      alert('No se pudo subir la imagen al Storage de Supabase.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategorySwitch = (catId) => {
    setSelectedCategory(catId);
    if (!editingId) {
      setFormData((prev) => ({ ...prev, categoria: catId }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim() || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const targetCat = formData.categoria || selectedCategory;
      if (editingId) {
        const { data, error } = await supabase
          .from('productos')
          .update({
            categoria: targetCat,
            nombre: formData.nombre,
            medidas: formData.medidas,
            precio1: formData.precio1,
            descripcion1: formData.descripcion1,
            precio2: formData.precio2,
            descripcion2: formData.descripcion2,
            foto: formData.foto,
            mostrar_en_catalogo: true
          })
          .eq('id', editingId)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setProducts((prev) => prev.map((item) => (item.id === editingId ? data : item)));
        }
        setEditingId(null);
      } else {
        const nextOrder = products.length;
        const { data, error } = await supabase
          .from('productos')
          .insert({
            orden: nextOrder,
            categoria: targetCat,
            nombre: formData.nombre,
            medidas: formData.medidas,
            precio1: formData.precio1,
            descripcion1: formData.descripcion1,
            precio2: formData.precio2,
            descripcion2: formData.descripcion2,
            foto: formData.foto,
            mostrar_en_catalogo: true
          })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setProducts((prev) => [...prev, data]);
        }
      }

      // Resetear formulario manteniendo la categoría activa
      setFormData({
        categoria: selectedCategory,
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
    } catch (err) {
      console.error('Error al guardar producto en el catálogo:', err);
      alert('No se pudo guardar el producto en Supabase. Intenta nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (prod) => {
    setEditingId(prod.id);
    const cat = prod.categoria || 'merchandising';
    setSelectedCategory(cat);
    setFormData({
      categoria: cat,
      nombre: prod.nombre || '',
      medidas: prod.medidas || '',
      precio1: prod.precio1 || '',
      descripcion1: prod.descripcion1 || '',
      precio2: prod.precio2 || '',
      descripcion2: prod.descripcion2 || '',
      foto: prod.foto || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      categoria: selectedCategory,
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

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este producto del catálogo y tarifario?')) {
      return;
    }
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (editingId === id) {
      handleCancelEdit();
    }
    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) {
      console.error('Error al eliminar producto:', error);
      setProducts(previous);
      alert('No se pudo eliminar el producto.');
    }
  };

  const handleMove = async (indexInFiltered, direction) => {
    const targetFilteredIndex = indexInFiltered + direction;
    if (
      targetFilteredIndex < 0 ||
      targetFilteredIndex >= filteredCatalogProducts.length
    ) {
      return;
    }

    const itemA = filteredCatalogProducts[indexInFiltered];
    const itemB = filteredCatalogProducts[targetFilteredIndex];

    const previous = products;
    const newProducts = [...products];
    const idxA = newProducts.findIndex((p) => p.id === itemA.id);
    const idxB = newProducts.findIndex((p) => p.id === itemB.id);
    if (idxA === -1 || idxB === -1) return;

    const temp = newProducts[idxA];
    newProducts[idxA] = newProducts[idxB];
    newProducts[idxB] = temp;
    setProducts(newProducts);

    // Actualizar solo los 2 ítems intercambiados en Supabase
    const [resA, resB] = await Promise.all([
      supabase.from('productos').update({ orden: idxB }).eq('id', itemA.id),
      supabase.from('productos').update({ orden: idxA }).eq('id', itemB.id)
    ]);
    if (resA.error || resB.error) {
      console.error('Error al reordenar productos:', resA.error || resB.error);
      setProducts(previous);
    }
  };

  const handleRestoreDefaults = async () => {
    if (
      !window.confirm(
        '¿Restaurar los productos base de Cartelería y Merchandising? Se reemplazarán los productos actuales de este rubro.'
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const { error: delError } = await supabase
        .from('productos')
        .delete()
        .eq('categoria', 'merchandising');
      if (delError) throw delError;

      const rowsToInsert = INITIAL_PRODUCTS.map((p, idx) => ({
        orden: idx,
        categoria: p.categoria || 'merchandising',
        nombre: p.nombre,
        medidas: p.medidas,
        precio1: p.precio1,
        descripcion1: p.descripcion1,
        precio2: p.precio2,
        descripcion2: p.descripcion2,
        foto: p.foto,
        mostrar_en_catalogo: true
      }));
      const { error: insError } = await supabase.from('productos').insert(rowsToInsert);
      if (insError) throw insError;

      if (typeof refreshProducts === 'function') {
        await refreshProducts();
      }
      handleCancelEdit();
    } catch (err) {
      console.error('Error al restaurar productos base:', err);
      alert('No se pudieron restaurar los productos base.');
    } finally {
      setIsSaving(false);
    }
  };

  // Paginación inteligente: 2 productos por hoja A4 garantizan proporción idéntica al original
  const ITEMS_PER_PAGE = 2;
  const pages = [];
  if (filteredCatalogProducts.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < filteredCatalogProducts.length; i += ITEMS_PER_PAGE) {
      pages.push(filteredCatalogProducts.slice(i, i + ITEMS_PER_PAGE));
    }
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#111827]">
      {/* ======================================================== */}
      {/* PANEL IZQUIERDO: CONTROLES Y FORMULARIO */}
      {/* ======================================================== */}
      <div className="no-print w-full lg:w-[460px] xl:w-[490px] bg-[#111827] border-r border-gray-700/70 flex flex-col h-auto lg:h-[calc(100vh-73px)] overflow-y-auto p-6 space-y-5">
        {/* Selector de Categoría del Catálogo */}
        <div className="bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-vorticer-gradient" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#F7F9FC]">
                Rubro del Catálogo
              </h2>
            </div>
            {typeof onGoToAdmin === 'function' && (
              <button
                type="button"
                onClick={onGoToAdmin}
                className="text-[11px] font-bold text-[#7BCBFF] hover:underline cursor-pointer"
              >
                Ir a Servicios y Precios →
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {VORTICER_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const count = products.filter(
                (p) =>
                  (p.categoria || 'merchandising') === cat.id &&
                  p.mostrar_en_catalogo !== false
              ).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategorySwitch(cat.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#374151] border-[#7BCBFF] shadow-md shadow-[#6A5CFF]/15'
                      : 'bg-[#111827] border-gray-700/80 hover:border-gray-600'
                  }`}
                >
                  <div className="min-w-0 pr-1">
                    <div
                      className={`text-xs font-bold truncate ${
                        isSelected ? 'text-[#F7F9FC]' : 'text-[#94A3B8]'
                      }`}
                    >
                      {cat.shortLabel}
                    </div>
                    <div className="text-[10px] text-[#7BCBFF] font-semibold">
                      {count} {count === 1 ? 'ítem' : 'ítems'}
                    </div>
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-[#7BCBFF] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-vorticer-gradient" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#F7F9FC]">
              {editingId ? 'Editar Producto del Catálogo' : `Agregar a ${currentCatMeta.shortLabel}`}
            </h2>
          </div>
          <p className="text-xs text-[#94A3B8]">
            La hoja A4 de la derecha muestra los productos de <strong>{currentCatMeta.shortLabel}</strong>.
          </p>
        </div>

        {/* Superficie Card #1F2A37 */}
        <form onSubmit={handleSubmit} className="bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-4 shadow-md">
          {/* Foto del producto */}
          <div>
            <label className="block text-xs text-[#94A3B8] mb-1.5">
              Foto o Mockup del Producto / Servicio
            </label>
            <div className="flex items-center gap-3">
              {formData.foto ? (
                <div className="relative w-20 h-20 bg-[#111827] rounded-xl border border-[#7BCBFF]/50 p-1 overflow-hidden group flex-shrink-0">
                  <img
                    src={formData.foto}
                    alt="Vista previa"
                    className="w-full h-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, foto: '' }))}
                    className="absolute inset-0 bg-[#111827]/85 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-red-400 cursor-pointer"
                    title="Eliminar foto"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className="flex-1 flex flex-col items-center justify-center h-20 border border-dashed border-gray-700 hover:border-[#7BCBFF] rounded-xl cursor-pointer bg-[#111827] transition">
                  <svg className="w-5 h-5 text-[#7BCBFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[11px] text-[#94A3B8] mt-1 font-medium">
                    {isUploadingImage ? 'Optimizando y subiendo a Storage...' : 'Subir imagen (.png, .jpg)'}
                  </span>
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

              {/* Alternativa: URL de foto */}
              {!formData.foto && (
                <div className="flex-1">
                  <input
                    type="text"
                    name="foto"
                    value={formData.foto}
                    onChange={handleInputChange}
                    placeholder="o ruta: /doble-tensor.png"
                    className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Nombre y Medidas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">
                Nombre *
              </label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleInputChange}
                placeholder="Ej: DOBLE TENSOR"
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] font-bold transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">
                Medidas / Subtítulo
              </label>
              <input
                type="text"
                name="medidas"
                value={formData.medidas}
                onChange={handleInputChange}
                placeholder="Ej: 90x190 cm o Mensual"
                className="w-full text-xs bg-[#111827] border border-gray-700 rounded-xl px-3.5 py-2.5 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] font-bold transition"
              />
            </div>
          </div>

          {/* Variante 1 */}
          <div className="p-3.5 bg-[#111827] rounded-xl border border-gray-700/80 space-y-2.5">
            <span className="text-xs font-bold text-[#7BCBFF] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#6A5CFF]" />
              Variante 1 (Principal)
            </span>
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">
                Precio Variante 1
              </label>
              <input
                type="text"
                name="precio1"
                value={formData.precio1}
                onChange={handleInputChange}
                placeholder="Ej: $158.760"
                className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#7BCBFF] font-bold focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">
                Descripción Variante 1
              </label>
              <textarea
                name="descripcion1"
                value={formData.descripcion1}
                onChange={handleInputChange}
                rows={2}
                placeholder="Ej: Incluye lonafront BRILLANTE, bolsillos, y bolsa para transportar."
                className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>
          </div>

          {/* Variante 2 */}
          <div className="p-3.5 bg-[#111827] rounded-xl border border-gray-700/80 space-y-2.5">
            <span className="text-xs font-bold text-[#7BCBFF] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#7BCBFF]" />
              Variante 2 (Opcional)
            </span>
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">
                Precio Variante 2
              </label>
              <input
                type="text"
                name="precio2"
                value={formData.precio2}
                onChange={handleInputChange}
                placeholder="Ej: $174.123"
                className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#7BCBFF] font-bold focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#94A3B8] mb-1">
                Descripción Variante 2
              </label>
              <textarea
                name="descripcion2"
                value={formData.descripcion2}
                onChange={handleInputChange}
                rows={2}
                placeholder="Ej: Incluye lona blackout MATE, bolsillos, y bolsa para transportar."
                className="w-full text-xs bg-[#1F2A37] border border-gray-700 rounded-lg px-3 py-2 text-[#F7F9FC] placeholder-[#94A3B8]/50 focus:outline-none focus:border-[#7BCBFF] transition"
              />
            </div>
          </div>

          {/* Botón CTA Principal con Gradiente Insignia */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-vorticer-gradient hover:opacity-95 text-[#F7F9FC] text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-[#6A5CFF]/25 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4 text-[#F7F9FC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>
                {isSaving
                  ? 'Guardando...'
                  : editingId
                  ? 'Guardar Cambios'
                  : 'Agregar al Catálogo'}
              </span>
            </button>

            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="bg-[#374151] hover:bg-[#374151]/80 text-[#F7F9FC] text-xs font-semibold py-2.5 px-4 rounded-xl border border-gray-700 transition cursor-pointer"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {/* Listado de productos actuales de esta categoría — Card #1F2A37 */}
        <div className="bg-[#1F2A37] border border-gray-700/80 rounded-2xl p-5 space-y-3 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-vorticer-gradient" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-vorticer-gradient">
                {currentCatMeta.shortLabel} ({loadingProducts ? '...' : filteredCatalogProducts.length})
              </h3>
            </div>
            {selectedCategory === 'merchandising' && (
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="text-[11px] text-[#7BCBFF] hover:underline font-medium cursor-pointer"
              >
                Restaurar base
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {filteredCatalogProducts.length === 0 ? (
              <div className="text-xs text-[#94A3B8] py-4 text-center">
                No hay ítems visibles en el catálogo para <strong>{currentCatMeta.label}</strong>.
              </div>
            ) : (
              filteredCatalogProducts.map((prod, index) => (
                <div
                  key={prod.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${
                    editingId === prod.id
                      ? 'bg-[#374151] border-[#7BCBFF]'
                      : 'bg-[#111827] border-gray-700/80 hover:border-[#7BCBFF]/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-[#1F2A37] flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-700">
                      {prod.foto ? (
                        <img src={prod.foto} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-[#94A3B8] font-bold">#</span>
                      )}
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-[#F7F9FC] truncate">
                        {prod.nombre} {prod.medidas}
                      </div>
                      <div className="text-[11px] text-[#7BCBFF] font-semibold truncate">
                        {prod.precio1 || prod.precio2 || 'Sin precio'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-[#94A3B8] hover:text-[#F7F9FC] disabled:opacity-30 cursor-pointer"
                      title="Mover arriba"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === filteredCatalogProducts.length - 1}
                      className="p-1 text-[#94A3B8] hover:text-[#F7F9FC] disabled:opacity-30 cursor-pointer"
                      title="Mover abajo"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(prod)}
                      className="p-1 text-[#7BCBFF] hover:opacity-80 cursor-pointer"
                      title="Editar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(prod.id)}
                      className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                      title="Eliminar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* PANEL DERECHO: VISTA PREVIA A4 IMPRIMIBLE */}
      {/* ======================================================== */}
      <div className="flex-1 bg-[#111827] overflow-auto p-4 md:p-8 flex flex-col items-center justify-start">
        <div className="no-print w-full max-w-[794px] mb-4 flex items-center justify-between text-xs text-[#94A3B8]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#7BCBFF]" />
            <span>
              Vista previa Hoja A4 — Catálogo{' '}
              <strong className="text-[#F7F9FC]">{currentCatMeta.label}</strong>
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1F2A37] border border-gray-700 text-[#7BCBFF] font-semibold">
            {pages.length} {pages.length === 1 ? 'Página generada' : 'Páginas generadas'}
          </span>
        </div>

        {/* Contenedor que se escala según el zoom en pantalla */}
        <div
          style={{
            transform: `scale(${previewScale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
          className="flex flex-col gap-10 items-center"
        >
          {/* ELEMENTO EXPORTABLE A PDF MULTIPÁGINA */}
          <div ref={printComponentRef} className="print-root flex flex-col gap-10">
            {pages.map((pageProducts, pageIdx) => (
              <div
                key={`page-${pageIdx}`}
                className="a4-sheet w-[794px] h-[1123px] bg-[#F7F9FC] text-[#1F2A37] shadow-2xl relative flex flex-col justify-between overflow-hidden font-['Inter',sans-serif] select-none"
                style={{
                  boxSizing: 'border-box'
                }}
              >
                {/* 1. ENCABEZADO OFICIAL VÓRTICER STUDIO */}
                <header className="w-full bg-black flex items-center justify-center p-0 flex-shrink-0">
                  <img
                    src="/logo.png"
                    alt="Vórticer Studio"
                    className="h-[180px] w-auto object-contain mx-auto select-none"
                    onError={(e) => {
                      if (!e.target.dataset.tried) {
                        e.target.dataset.tried = 'true';
                        e.target.src = 'logo.png';
                      }
                    }}
                  />
                </header>

                {/* 2. CUERPO DEL CATÁLOGO (GRID DE PRODUCTOS) */}
                <main className="flex-1 px-12 py-6 flex flex-col justify-start">
                  {pageProducts.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-16">
                      <svg className="w-16 h-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-500">
                        No hay ítems en el catálogo de {currentCatMeta.shortLabel}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Agrega ítems desde el panel izquierdo o actívalos en Servicios y Precios.
                      </p>
                    </div>
                  ) : (
                    pageProducts.map((product, idx) => (
                      <React.Fragment key={product.id}>
                        <div className="grid grid-cols-12 gap-8 items-center py-6">
                          {/* Columna Izquierda: Foto del Producto */}
                          <div className="col-span-5 flex items-center justify-center p-3 rounded-2xl border border-gray-200/80 bg-white h-[260px] shadow-sm overflow-hidden">
                            {product.foto ? (
                              <img
                                src={product.foto}
                                alt={product.nombre}
                                crossOrigin={product.foto.startsWith('http') ? 'anonymous' : undefined}
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <div className="text-center text-gray-300">
                                <svg className="w-12 h-12 mx-auto stroke-current" fill="none" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span className="text-[11px] text-gray-400 font-semibold block mt-1">Sin imagen</span>
                              </div>
                            )}
                          </div>

                          {/* Columna Derecha: Título, Medidas, Precios y Descripciones */}
                          <div className="col-span-7 flex flex-col justify-center pl-2">
                            <h3 className="text-[26px] font-black text-[#1F2A37] tracking-tight uppercase leading-snug">
                              {product.nombre} {product.medidas && <span className="font-extrabold">{product.medidas}</span>}
                            </h3>

                            {product.precio1 && (
                              <div className="mt-3">
                                <div className="text-[28px] font-black text-[#6A5CFF] tracking-tight leading-none">
                                  {product.precio1}
                                </div>
                                {product.descripcion1 && (
                                  <p className="text-[13px] text-gray-700 leading-snug mt-1 font-medium">
                                    {product.descripcion1}
                                  </p>
                                )}
                              </div>
                            )}

                            {product.precio2 && (
                              <div className="mt-4">
                                <div className="text-[28px] font-black text-[#6A5CFF] tracking-tight leading-none">
                                  {product.precio2}
                                </div>
                                {product.descripcion2 && (
                                  <p className="text-[13px] text-gray-700 leading-snug mt-1 font-medium">
                                    {product.descripcion2}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {idx < pageProducts.length - 1 && (
                          <div className="w-full border-b border-gray-200/90 my-2" />
                        )}
                      </React.Fragment>
                    ))
                  )}
                </main>

                {/* 3. PIE DE PÁGINA OFICIAL VÓRTICER STUDIO */}
                <footer className="w-full pb-7 pt-4 px-10 text-center border-t border-gray-200/70 mt-auto flex-shrink-0">
                  <p className="text-[12px] text-gray-600 font-semibold tracking-wide">
                    Vórticer Studio | {currentCatMeta.label} | Precio + IVA | +54 9 299 462-1939 | vorticerstudio@gmail.com
                  </p>
                </footer>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
