function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportToPdf(elementId: string, filename: string): Promise<void> {
  return new Promise((resolve) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(elementId)) {
      resolve();
      return;
    }
    const element = document.getElementById(elementId);
    if (!element) {
      alert("Print document element not found.");
      resolve();
      return;
    }

    const cleanFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    const safeTitle = escapeHtml(cleanFilename);

    try {
      let iframe = document.getElementById("pdf-print-iframe") as HTMLIFrameElement;
      if (iframe) {
        iframe.remove();
      }
      iframe = document.createElement("iframe");
      iframe.id = "pdf-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (!frameDoc) {
        window.print();
        resolve();
        return;
      }

      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${safeTitle}</title>
            <style>
              @page {
                size: A4 landscape;
                margin: 0;
              }
              * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff !important;
                color: #000000 !important;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 5.5pt;
              }
              #${elementId} {
                width: 100% !important;
                max-width: 100% !important;
                padding: 6mm 7mm 16mm 7mm !important;
                margin: 0 !important;
                background: #ffffff !important;
                box-sizing: border-box !important;
              }
              table {
                border-collapse: collapse !important;
                width: 100% !important;
                page-break-inside: auto;
              }
              thead {
                display: table-header-group !important;
              }
              tfoot {
                display: table-footer-group !important;
              }
              tr {
                page-break-inside: avoid !important;
                page-break-after: auto;
              }
              th, td {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .lampiran-page-footer {
                position: fixed !important;
                bottom: 3.5mm !important;
                left: 7mm !important;
                right: 7mm !important;
                width: auto !important;
                background: #ffffff !important;
                padding-top: 0 !important;
                border-top: none !important;
                z-index: 9999 !important;
              }
            </style>
          </head>
          <body>
            ${element.outerHTML}
          </body>
        </html>
      `);
      frameDoc.close();

      const images = Array.from(frameDoc.images);
      let printed = false;
      const triggerPrint = () => {
        if (printed) return;
        printed = true;
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error("Iframe print error:", e);
            window.print();
          } finally {
            resolve();
          }
        }, 150);
      };

      if (images.length === 0) {
        setTimeout(triggerPrint, 250);
      } else {
        let pending = images.length;
        const onOneDone = () => {
          pending--;
          if (pending <= 0) {
            triggerPrint();
          }
        };

        images.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            onOneDone();
          } else {
            img.onload = onOneDone;
            img.onerror = onOneDone;
          }
        });

        // Safety timeout so user never waits more than 1.8s
        setTimeout(triggerPrint, 1800);
      }
    } catch (err) {
      console.warn("PDF export fallback to window.print:", err);
      window.print();
      resolve();
    }
  });
}

export function printDocument() {
  window.print();
}
