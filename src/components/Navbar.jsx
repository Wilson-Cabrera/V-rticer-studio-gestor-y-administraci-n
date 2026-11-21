import React from 'react';

export default function Navbar({
  activeTab,
  setActiveTab,
  previewScale,
  setPreviewScale,
  onDownloadPDF,
  isPrinting,
  totalServicesCount = 0
}) {
  return (
    <header className="no-print bg-[#1F2A37] border-b border-gray-700/80 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-lg">
      {/* Identidad del Logo + Navegación principal */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-32 overflow-hidden flex items-center justify-center rounded-xl bg-[#111827]/80 border border-gray-700/70 flex-shrink-0">
            <img
              src="/logo.png"
              alt="Vórticer Studio"
              className="h-20 w-auto max-w-none object-contain select-none mix-blend-screen"
            />
          </div>

          <div className="hidden md:block">
            <span className="text-sm font-extrabold tracking-tight text-vorticer-gradient block">
              VÓRTICER STUDIO
            </span>
            <span className="text-[11px] text-[#94A3B8] block leading-tight">
              Gestión Comercial
            </span>
          </div>
        </div>

        {/* Selector de los 3 Módulos con nombres claros para todo el equipo */}
        <nav className="flex items-center bg-[#111827] p-1 rounded-xl border border-gray-700/80 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('presupuestador')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'presupuestador'
                ? 'bg-[#1F2A37] text-[#7BCBFF] border border-[#7BCBFF]/40 shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F7F9FC]'
            }`}
          >
            <svg className="w-4 h-4 text-[#7BCBFF] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Presupuestos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('catalogo')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'catalogo'
                ? 'bg-[#1F2A37] text-[#7BCBFF] border border-[#7BCBFF]/40 shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F7F9FC]'
            }`}
          >
            <svg className="w-4 h-4 text-[#7BCBFF] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span>Catálogo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-[#1F2A37] text-[#7BCBFF] border border-[#7BCBFF]/40 shadow-sm'
                : 'text-[#94A3B8] hover:text-[#F7F9FC]'
            }`}
          >
            <svg className="w-4 h-4 text-[#7BCBFF] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            <span>Servicios y Precios</span>
          </button>
        </nav>
      </div>

      {/* Controles de Zoom y Descarga PDF */}
      {activeTab !== 'admin' ? (
        <div className="flex items-center gap-3 ml-auto">
          <div className="hidden lg:flex items-center gap-1 bg-[#111827] px-3 py-1.5 rounded-xl border border-gray-700/80 text-xs">
            <span className="text-[#94A3B8] mr-1">Zoom:</span>
            {[
              { label: '75%', value: 0.75 },
              { label: '90%', value: 0.9 },
              { label: '100%', value: 1 }
            ].map((zoom) => (
              <button
                key={zoom.label}
                type="button"
                onClick={() => setPreviewScale(zoom.value)}
                className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                  previewScale === zoom.value
                    ? 'bg-[#6A5CFF] text-[#F7F9FC] font-semibold'
                    : 'text-[#94A3B8] hover:text-[#F7F9FC]'
                }`}
              >
                {zoom.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onDownloadPDF}
            disabled={isPrinting}
            className="flex items-center justify-center gap-2 bg-vorticer-gradient hover:opacity-95 text-[#F7F9FC] text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-[#6A5CFF]/25 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
          >
            <svg className="w-4 h-4 text-[#F7F9FC] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>
              {isPrinting
                ? 'Generando PDF...'
                : activeTab === 'catalogo'
                ? 'Descargar Catálogo PDF'
                : 'Descargar Presupuesto PDF'}
            </span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-[#94A3B8] bg-[#111827] px-3.5 py-2 rounded-xl border border-gray-700 whitespace-nowrap">
            Servicios cargados:{' '}
            <strong className="text-[#7BCBFF]">{totalServicesCount}</strong>
          </span>
        </div>
      )}
    </header>
  );
}
