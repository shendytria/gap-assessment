export async function exportToPdf(elementId: string, filename: string) {
  const element = document.getElementById(elementId);
  if (!element) {
    alert("Elemen dokumen cetak tidak ditemukan.");
    return;
  }

  try {
    // Dynamic import to prevent Next.js SSR error
    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default || html2pdfModule;

    const opt = {
      margin: [6, 6, 6, 6],
      filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    };

    // @ts-ignore
    await html2pdf().set(opt).from(element).save();
  } catch (err) {
    console.warn("Direct html2pdf failed, falling back to print dialog:", err);
    window.print();
  }
}

export function printDocument() {
  window.print();
}
