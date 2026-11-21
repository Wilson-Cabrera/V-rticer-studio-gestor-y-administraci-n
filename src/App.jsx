import React, { useState, useRef, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import CatalogGenerator from './components/CatalogGenerator';
import BudgetGenerator from './components/BudgetGenerator';
import AdminServicesPanel from './components/AdminServicesPanel';
import { INITIAL_PRODUCTS } from './data/initialProducts';
import { supabase } from './lib/supabase';

export default function App() {
  const [activeTab, setActiveTab] = useState('presupuestador');
  const [previewScale, setPreviewScale] = useState(0.9);
  const [isExporting, setIsExporting] = useState(false);
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  // Referencia para notificar al Presupuestador cuando se exporta un PDF y debe avanzar el correlativo
  const onBudgetExportedRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // En pantallas móviles o paneles angostos (< 820px), ajustamos automáticamente la escala
  // de la hoja A4 (794px) para que entre completa sin desbordar horizontalmente.
  const effectivePreviewScale =
    windowWidth < 820
      ? Math.max(0.35, Math.min(previewScale, (windowWidth - 28) / 794))
      : previewScale;

  // Cargar servicios y productos desde Supabase al iniciar
  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('orden', { ascending: true })
        .order('created_at', { ascending: true });

      if (!error && data) {
        setProducts(data);
      }
    } catch (err) {
      console.error('Error al cargar servicios/productos desde Supabase:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const printComponentRef = useRef(null);

  const triggerDownloadPDF = async () => {
    if (!printComponentRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const currentBudgetNum =
        typeof onBudgetExportedRef.current?.getCurrentNumber === 'function'
          ? onBudgetExportedRef.current.getCurrentNumber()
          : null;

      const fileName =
        activeTab === 'catalogo'
          ? `Catalogo_Vorticer_Studio_${dateStr}.pdf`
          : `Presupuesto_${currentBudgetNum || '0001'}_Vorticer_Studio_${dateStr}.pdf`;

      const { exportContainerToPDF } = await import('./utils/exportPdf');
      await exportContainerToPDF(printComponentRef.current, fileName);

      // Si estamos en el Presupuestador, al exportar el PDF avanzamos el índice correlativo
      // en Supabase para que nunca retroceda y el próximo presupuesto pase al número siguiente.
      if (
        activeTab === 'presupuestador' &&
        typeof onBudgetExportedRef.current?.advanceAfterExport === 'function'
      ) {
        await onBudgetExportedRef.current.advanceAfterExport();
      }
    } catch (err) {
      console.error('Error al exportar PDF:', err);
      alert('Ocurrió un error al exportar el PDF. Intenta nuevamente.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111827] text-[#F7F9FC] flex flex-col font-['Inter',sans-serif]">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        previewScale={previewScale}
        setPreviewScale={setPreviewScale}
        onDownloadPDF={triggerDownloadPDF}
        isPrinting={isExporting}
        totalServicesCount={products.length}
      />

      {activeTab === 'admin' ? (
        <AdminServicesPanel
          products={products}
          setProducts={setProducts}
          refreshProducts={fetchProducts}
          loadingProducts={loadingProducts}
        />
      ) : activeTab === 'catalogo' ? (
        <CatalogGenerator
          products={products}
          setProducts={setProducts}
          refreshProducts={fetchProducts}
          loadingProducts={loadingProducts}
          previewScale={effectivePreviewScale}
          printComponentRef={printComponentRef}
          onGoToAdmin={() => setActiveTab('admin')}
        />
      ) : (
        <BudgetGenerator
          products={products}
          previewScale={effectivePreviewScale}
          printComponentRef={printComponentRef}
          onBudgetExportedRef={onBudgetExportedRef}
          onGoToAdmin={() => setActiveTab('admin')}
        />
      )}
    </div>
  );
}
