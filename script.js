//--------------------------------------------
// GLOBAL HELPERS & UI LOGIC
//--------------------------------------------

// Set the worker URL for PDF.js (CRITICAL for it to work)
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.js';
}

const statusEl = document.getElementById('status-message');

/**
 * Displays a non-blocking status message.
 * @param {string} message The message to display.
 * @param {'success'|'error'|'processing'|'hidden'} type The type of message.
 */
function setStatus(message, type = 'processing') {
    statusEl.textContent = message;
    statusEl.className = ''; // Reset classes
    
    if (type === 'hidden') {
        statusEl.classList.add('hidden');
        return;
    }

    statusEl.classList.remove('hidden');
    statusEl.classList.add(`status-${type}`);
    
    // Auto-hide success/error messages after a delay
    if (type === 'success' || type === 'error') {
        setTimeout(() => setStatus('', 'hidden'), 8000);
    }
}

// Tab Switching Logic
function showTab(tabId) {
    // Hide all content and ensure the grid class is only present when visible
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected content and activate button
    document.getElementById(`content-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    // Clear any active status message when switching tabs
    setStatus('', 'hidden');
}

// Initialize the default tab on load
document.addEventListener('DOMContentLoaded', () => {
    // Set 'image' as the default active tab
    showTab('image');
});

// File Name Display Logic
function getFileDefaultLabel(inputId) {
    if (inputId.includes('imgToPdfInput')) return 'Select Image File (JPG/PNG)';
    if (inputId.includes('imgSizeInput')) return 'Select Image File (JPG)';
    if (inputId.includes('pdf')) return 'Select PDF File';
    return 'Select File';
}

function updateFileName(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (input.files.length > 0) {
        label.textContent = input.files[0].name;
    } else {
        label.textContent = getFileDefaultLabel(inputId);
    }
}

function clearFileInput(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    
    // Reset the file input value
    input.value = ''; 
    
    // Reset the label text
    label.textContent = getFileDefaultLabel(inputId);
    
    // Clear status when a file is cleared
    setStatus('', 'hidden');
}


// Read file as DataURL
function readFileAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

// Convert DataURL to Blob
function dataURLToBlob(dataUrl) {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

// Download Helper
function downloadFile(data, filename) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
    setStatus(`✅ File successfully generated and downloaded as **${filename}**`, 'success');
}

//--------------------------------------------
// IMAGE → PDF CONVERSION (jsPDF)
//--------------------------------------------
async function convertImageToPDF() {
    const input = document.getElementById("imgToPdfInput").files[0];
    if (!input) return setStatus("Error: Please choose an image file!", 'error');
    
    setStatus("Processing... Converting image to PDF format.", 'processing');

    const file = input;
    const reader = new FileReader();

    reader.onload = function () {
        const img = new Image();
        img.onload = function () {
            try {
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF("p", "mm");

                const width = img.width;
                const height = img.height;
                const ratio = width / height;

                // A4 dimensions in mm are 210 x 297. Use 210 max width.
                const pdfMargin = 10; 
                const maxPdfWidth = 210 - 2 * pdfMargin;
                let pdfWidth = maxPdfWidth;
                let pdfHeight = maxPdfWidth / ratio;
                
                // Adjust for landscape orientation if necessary
                if (ratio > (210/297)) {
                    pdfHeight = maxPdfWidth / ratio;
                } else {
                    // Portrait or similar aspect ratio
                    pdfHeight = maxPdfWidth / ratio;
                }

                pdf.addImage(img, "JPEG", pdfMargin, pdfMargin, pdfWidth, pdfHeight);
                pdf.save("ConvertedImage.pdf");
                setStatus(`✅ Successfully converted **${file.name}** to PDF.`, 'success');

            } catch (e) {
                setStatus(`❌ Conversion Failed: ${e.message}`, 'error');
            }
        };
        img.src = reader.result;
    };

    reader.onerror = () => setStatus("❌ Error reading the image file.", 'error');

    reader.readAsDataURL(file);
}

//--------------------------------------------
// IMAGE SIZE REDUCTION (CANVAS)
//--------------------------------------------
async function compressImageToTarget() {
    const file = document.getElementById("imgSizeInput").files[0];
    const targetKB = Number(document.getElementById("targetImgKB").value);

    if (!file) return setStatus("Error: Select an image file!", 'error');
    if (!targetKB || targetKB < 10) return setStatus("Error: Enter a valid target size (minimum 10 KB)!", 'error');
    
    setStatus(`Processing... Target size: ${targetKB} KB. Initiating iterative compression.`, 'processing');

    let quality = 0.95;
    let result;
    const img = new Image();
    try {
        img.src = await readFileAsDataURL(file);

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);


        while (quality >= 0.05) {
            result = canvas.toDataURL("image/jpeg", quality);

            const sizeKB = Math.round(result.length / 1024);
            setStatus(`Processing... Current quality: ${Math.round(quality * 100)}%. Size: ${sizeKB} KB.`, 'processing');

            if (sizeKB <= targetKB) break;

            quality = Math.max(0.05, quality - 0.05);
        }
        
        const finalSizeKB = Math.round(result.length / 1024);
        if (finalSizeKB > targetKB) {
             setStatus(`⚠️ Target size not fully met. Achieved ${finalSizeKB} KB (Target: ${targetKB} KB) at minimum quality. Downloading result.`, 'error');
        } else {
             setStatus(`✅ Target met! Achieved ${finalSizeKB} KB at ${Math.round(quality * 100)}% quality. Downloading result.`, 'success');
        }

        downloadFile(dataURLToBlob(result), "CompressedImage.jpg");

    } catch (e) {
        setStatus(`❌ Compression Failed: ${e.message}`, 'error');
    }
}

/* ----------------------------------------------------
   CORE PDF COMPRESSION FUNCTION (PDF.JS RENDERING)
---------------------------------------------------- */

async function performPdfRenderingCompression(file, quality) {
    const buffer = await file.arrayBuffer();
    const pdfDocLib = await PDFLib.PDFDocument.create();
    
    // Load PDF using PDF.js
    const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    
    const canvas = document.getElementById('pdfCanvas');
    const context = canvas.getContext('2d');
    
    const totalPages = pdf.numPages;

    // Iterate through pages
    for (let i = 1; i <= totalPages; i++) {
        setStatus(`Processing page ${i} of ${totalPages}... Rendering at ${Math.round(quality * 100)}% quality.`, 'processing');

        const page = await pdf.getPage(i);
        // Use a slightly higher scale for better image quality - 2.0 is often a good balance.
        const viewport = page.getViewport({ scale: 2.0 }); 

        // Set canvas dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page to canvas
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };
        await page.render(renderContext).promise;

        // Compress the rendered page image using the canvas API
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Convert DataURL to ArrayBuffer
        const jpegBytes = await fetch(dataUrl).then(res => res.arrayBuffer());

        // Embed the compressed JPEG into the new PDF
        const jpegImage = await pdfDocLib.embedJpg(jpegBytes);
        
        // Add a new page with the original dimensions (in PDFLib terms)
        const pdfPage = pdfDocLib.addPage([viewport.width, viewport.height]);

        // Draw the compressed JPEG across the entire new page
        pdfPage.drawImage(jpegImage, {
            x: 0,
            y: 0,
            width: viewport.width,
            height: viewport.height,
        });
    }

    return pdfDocLib.save();
}

//--------------------------------------------
// PDF COMPRESSION - MODE 1: COMPRESSION LEVEL (Rendering Quality)
//--------------------------------------------
async function compressPDFByRenderingQuality(inputId, qualityId) {
    const input = document.getElementById(inputId);
    const quality = parseFloat(document.getElementById(qualityId).value);

    if (!input.files.length) return setStatus("Error: Select a PDF file!", 'error');
    const file = input.files[0];
    
    setStatus(`Initiating PDF compression at ${Math.round(quality * 100)}% rendering quality...`, 'processing');
    
    try {
        const compressedBytes = await performPdfRenderingCompression(file, quality);
        
        const sizeKB = Math.round(compressedBytes.byteLength / 1024);
        downloadFile(compressedBytes, "compressed_rendered_quality.pdf");
        
        setStatus(`✅ Compression complete! Final size: ${sizeKB} KB at ${Math.round(quality * 100)}% quality.`, 'success');

    } catch (e) {
        console.error("Compression Failed:", e);
        setStatus(`❌ PDF compression failed. Error: ${e.message}`, 'error');
    }
}


//--------------------------------------------
// PDF COMPRESSION - MODE 2: TARGET KB (Iterative Rendering Attempt)
//--------------------------------------------
async function compressPDFByTargetRendering() {
    const input = document.getElementById("pdfInputTarget");
    const targetKB = parseInt(document.getElementById("targetPdfKB").value);

    if (!input.files.length) return setStatus("Error: Select a PDF file!", 'error');
    if (!targetKB || targetKB < 10) return setStatus("Error: Enter a valid target size (minimum 10 KB)", 'error');
    
    setStatus(`Initiating iterative compression attempt. Target KB: ${targetKB}.`, 'processing');

    const file = input.files[0];
    let compressedBytes;
    let sizeKB;
    
    // Ordered qualities to try: High to Low
    const qualities = [0.9, 0.7, 0.5, 0.3];

    try {
        for (const quality of qualities) {
            setStatus(`Attempting compression at ${Math.round(quality * 100)}% quality...`, 'processing');
            
            compressedBytes = await performPdfRenderingCompression(file, quality);
            sizeKB = Math.round(compressedBytes.byteLength / 1024);

            if (sizeKB <= targetKB) {
                setStatus(`✅ Target met at ${Math.round(quality * 100)}% quality! Compressed size: ${sizeKB} KB. Downloading file.`, 'success');
                downloadFile(compressedBytes, "compressed_target_success.pdf");
                return;
            }
            setStatus(`Size at ${Math.round(quality * 100)}% quality: ${sizeKB} KB (Still above target). Moving to next level.`, 'processing');
        }

        // Final step: Alert failure and download the smallest achieved file (from the last quality tried)
        setStatus(`❌ Compression failed to reach the target KB (${targetKB} KB). Lowest achieved size was ${sizeKB} KB at 30% rendering quality. Downloading this result.`, 'error');
        downloadFile(compressedBytes, "compressed_target_attempt.pdf");

    } catch (e) {
        console.error("Target Compression Failed:", e);
        setStatus(`❌ PDF compression failed. Error: ${e.message}`, 'error');
    }
}