import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Exporta todas las hojas .a4-sheet dentro de un contenedor directamente a un archivo .pdf
 * multipágina sin abrir la ventana de impresión del sistema operativo.
 */
export async function exportContainerToPDF(containerEl, fileName = 'Documento_Vorticer.pdf') {
  if (!containerEl) return;

  const sheets = Array.from(containerEl.querySelectorAll('.a4-sheet'));
  if (sheets.length === 0) return;

  // Contenedor temporal aislado de cualquier scroll o escala (zoom) de la interfaz
  const stagingWrapper = document.createElement('div');
  stagingWrapper.style.position = 'fixed';
  stagingWrapper.style.top = '0px';
  stagingWrapper.style.left = '-10000px';
  stagingWrapper.style.width = '794px';
  stagingWrapper.style.height = '1123px';
  stagingWrapper.style.overflow = 'hidden';
  stagingWrapper.style.zIndex = '-9999';
  stagingWrapper.style.pointerEvents = 'none';
  stagingWrapper.style.background = '#ffffff';
  document.body.appendChild(stagingWrapper);

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    for (let i = 0; i < sheets.length; i++) {
      const originalSheet = sheets[i];
      const clone = originalSheet.cloneNode(true);

      clone.style.transform = 'none';
      clone.style.width = '794px';
      clone.style.height = '1123px';
      clone.style.minHeight = '1123px';
      clone.style.maxHeight = '1123px';
      clone.style.margin = '0';
      clone.style.boxShadow = 'none';

      stagingWrapper.innerHTML = '';
      stagingWrapper.appendChild(clone);

      // Asegurar que todas las imágenes de la hoja estén listas antes de renderizar
      const imgs = Array.from(clone.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        height: 1123,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1200,
        windowHeight: 1400
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    const cleanName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    pdf.save(cleanName);
  } finally {
    if (stagingWrapper.parentNode) {
      stagingWrapper.parentNode.removeChild(stagingWrapper);
    }
  }
}
