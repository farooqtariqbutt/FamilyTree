
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const generatePdf = async (element: HTMLElement, fileName: string, orientation: 'p' | 'l' = 'p') => {
    if (!element) return;
    
    try {
        // Force a white background and capture the full scrollable area
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff', // Force white background for clarity
            width: element.scrollWidth,  // Capture full width
            height: element.scrollHeight, // Capture full height
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
            onclone: (doc) => {
                // Force light theme on the cloned document for consistent styling in PDF
                doc.documentElement.classList.remove('dark');
                
                // Inject a style block to override any lingering dark-mode styles and ensure legibility
                const style = doc.createElement('style');
                style.innerHTML = `
                    body, body * {
                      color: #1f2937 !important; /* A dark gray, tailwind gray-800 */
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                    }

                    /* Ensure key backgrounds are solid and opaque for the PDF */
                    .bg-white { background-color: #ffffff !important; }
                    .bg-gray-50 { background-color: #f9fafb !important; }
                    .bg-gray-100 { background-color: #f3f4f6 !important; }
                    .bg-blue-100 { background-color: #dbeafe !important; }
                    .bg-indigo-100 { background-color: #e0e7ff !important; }
                    .bg-green-100 { background-color: #d1fae5 !important; }
                    .bg-red-100 { background-color: #fee2e2 !important; }
                    .bg-yellow-100 { background-color: #fef9c3 !important; }
                    
                    /* Use solid colors for gender indicators instead of transparent ones */
                    .bg-male { background-color: #eff6ff !important; } /* A solid light blue */
                    .bg-female { background-color: #fce7f3 !important; } /* A solid light pink */
                    
                    /* Override specific text colors to maintain them */
                    .text-blue-600 { color: #2563eb !important; }
                    .text-blue-800 { color: #1e40af !important; }
                    .text-indigo-600 { color: #4f46e5 !important; }
                    .text-indigo-800 { color: #3730a3 !important; }
                    .text-green-600 { color: #16a34a !important; }
                    .text-green-800 { color: #065f46 !important; }
                    .text-gray-500 { color: #6b7280 !important; }
                    .text-gray-600 { color: #4b5563 !important; }

                    /* Remove shadows and animations that don't translate well to PDF */
                    * {
                      box-shadow: none !important;
                      text-shadow: none !important;
                      transition: none !important;
                      animation: none !important;
                    }
                `;
                doc.head.appendChild(style);

                // Remove elements that shouldn't be in the PDF
                doc.querySelectorAll('.no-print').forEach(el => {
                    (el as HTMLElement).style.display = 'none';
                });
            }
        });

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const pdf = new jsPDF(orientation, 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        
        const imgProps= pdf.getImageProperties(imgData);
        // Calculate the image dimensions to fit within the page width, maintaining aspect ratio
        const imgWidth = pdfWidth - margin * 2;
        const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
        
        let heightLeft = imgHeight;
        let position = margin;
        
        // Add the first page
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - margin * 2);

        // Add more pages if content is taller than one page
        while (heightLeft > 0) {
            position = -heightLeft + margin;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - margin * 2);
        }

        // Add footer to each page
        const pageCount = pdf.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(8);
            pdf.setTextColor(150);

            // Date and time on the left
            const dateTime = new Date().toLocaleString();
            pdf.text(dateTime, margin, pdfHeight - margin);

            // Page number on the right
            const pageNumText = `Page ${i} of ${pageCount}`;
            const textWidth = pdf.getStringUnitWidth(pageNumText) * pdf.getFontSize() / pdf.internal.scaleFactor;
            pdf.text(pageNumText, pdfWidth - margin - textWidth, pdfHeight - margin);
        }

        pdf.save(`${fileName.replace(/\s/g, '_')}.pdf`);

    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Sorry, an error occurred while generating the PDF.");
    }
};
