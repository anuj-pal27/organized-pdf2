// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Global variables
let mergedPdfDoc = null;
let totalPages = 0;
let pageThumbnails = [];
let autoSaveTimeout = null;
let lastSavedOrder = null;
const pageRotations = {}; // { pageNumber: rotationInDegrees }


// DOM Elements
const pdfInput = document.getElementById('pdfInput');
const dropZone = document.getElementById('dropZone');
const pdfList = document.getElementById('pdfList');
const saveChangesBtn = document.getElementById('saveChangesBtn');
const addPdfBtn = document.getElementById('addPdfBtn');
const autoSaveStatus = document.createElement('div');
autoSaveStatus.className = 'auto-save-status';
document.querySelector('.pdf-controls').appendChild(autoSaveStatus);

// Event Listeners
pdfInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('drop', handleDrop);
saveChangesBtn.addEventListener('click', saveReorganizedPDF);
addPdfBtn.addEventListener('click', () => pdfInput.click());

// Handle file selection
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        await loadPDF(file);
    } else {
        alert('Please select a valid PDF file.');
    }
}

// Handle drag and drop
function handleDragOver(event) {
    event.preventDefault();
    dropZone.classList.add('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    
    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    } else {
        alert('Please drop a valid PDF file.');
    }
}

// Load and merge PDF file
async function loadPDF(file) {
    try {
        showLoading();
        const arrayBuffer = await file.arrayBuffer();
        const newPdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        
        if (!mergedPdfDoc) {
            // First PDF - initialize merged document
            mergedPdfDoc = newPdfDoc;
            totalPages = mergedPdfDoc.numPages;
        } else {
            // Merge with existing PDF
            const newPdfBytes = await newPdfDoc.getData();
            const mergedPdfBytes = await mergedPdfDoc.getData();
            
            // Create new merged PDF using PDF-lib
            const mergedPdfLib = await PDFLib.PDFDocument.create();
            
            // Copy pages from existing PDF
            const existingPages = await mergedPdfLib.copyPages(
                await PDFLib.PDFDocument.load(mergedPdfBytes),
                Array.from({ length: mergedPdfDoc.numPages }, (_, i) => i)
            );
            existingPages.forEach(page => mergedPdfLib.addPage(page));
            
            // Copy pages from new PDF
            const newPages = await mergedPdfLib.copyPages(
                await PDFLib.PDFDocument.load(newPdfBytes),
                Array.from({ length: newPdfDoc.numPages }, (_, i) => i)
            );
            newPages.forEach(page => mergedPdfLib.addPage(page));
            
            // Save merged PDF
            const mergedBytes = await mergedPdfLib.save();
            mergedPdfDoc = await pdfjsLib.getDocument(mergedBytes).promise;
            totalPages = mergedPdfDoc.numPages;
        }
        
        // Show PDF controls
        document.querySelector('.pdf-controls').style.display = 'flex';
        
        // Generate thumbnails for all pages
        await generateThumbnails();
        
        // Enable save button
        saveChangesBtn.disabled = false;
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Error loading PDF. Please try again.');
    } finally {
        hideLoading();
    }
}

// Generate thumbnails for all pages
async function generateThumbnails() {
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'page-grid';
    
    for (let i = 1; i <= totalPages; i++) {
        const page = await mergedPdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = viewport.width+25;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        const thumbnail = createThumbnailElement(canvas, i);
        thumbnailContainer.appendChild(thumbnail);
        pageThumbnails.push(thumbnail);
    }
    
    pdfList.innerHTML = '';
    pdfList.appendChild(thumbnailContainer);
    setupDragAndDrop(thumbnailContainer);
}

// create thubnail element
function createThumbnailElement(canvas, pageNumber) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-thumbnail';
    wrapper.draggable = true;
    wrapper.dataset.pageNumber = pageNumber;
    wrapper.dataset.originalPageNumber = pageNumber; // Store original for reorder/save
    wrapper.dataset.rotation = "0"; // Default rotation

    // Page canvas
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = canvas.height;
    pageCanvas.getContext('2d').drawImage(canvas, 0, 0);

    // Page number label
    const pageNumberDiv = document.createElement('div');
    pageNumberDiv.className = 'page-number';
    pageNumberDiv.textContent = `Page ${pageNumber}`;

    // Rotation button
    const rotateButton = document.createElement('button');
    rotateButton.textContent = '⟳';
    rotateButton.className = 'rotate-button';
    rotateButton.title = 'Rotate 90°';

    rotateButton.addEventListener('click', () => {
        // Rotate the thumbnail visually
        let currentRotation = parseInt(wrapper.dataset.rotation || '0');
        currentRotation = (currentRotation + 90) % 360;
        wrapper.dataset.rotation = currentRotation;

        pageCanvas.style.transform = `rotate(${currentRotation}deg)`;

        // triggerAutoSave?.(); // Optional: call if you use auto-saving
    });
    
    //Delete button
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML= '<i class="fa-solid fa-trash"></i>';
    deleteButton.className = 'delete-button';
    deleteButton.title = 'Delete this page';

    deleteButton.addEventListener('click',()=>{
        wrapper.remove();
        updatePageNumbers();
    })
    //flip button functionality 

const flipButton = document.createElement('button');
    flipButton.innerHTML = '<i class="fas fa-arrows-alt-h"></i>'; // Font Awesome flip icon
    flipButton.className = 'flip-button';
    flipButton.title = 'Flip page horizontally';

// Store flip state
wrapper.dataset.flip = 'none';

flipButton.addEventListener('click', () => {
    const currentFlip = wrapper.dataset.flip;
    if (currentFlip === 'none') {
        wrapper.dataset.flip = 'horizontal';
        flipButton.classList.add('flipped');
        pageCanvas.style.transform = `scaleX(-1)`; 
    } else {
        wrapper.dataset.flip = 'none';
        flipButton.classList.remove('flipped');
        pageCanvas.style.transform = ''; 
    }
});

    // Controls wrapper
    const controls = document.createElement('div');
    controls.className = 'thumbnail-controls';
    controls.appendChild(rotateButton);
    controls.appendChild(deleteButton);
    controls.appendChild(flipButton);
    wrapper.appendChild(pageCanvas);
    wrapper.appendChild(pageNumberDiv);
    wrapper.appendChild(controls);

    return wrapper;
}



// Setup drag and drop functionality
function setupDragAndDrop(container) {
    let draggedElement = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let initialY = 0;
    let initialX = 0;
    let currentY = 0;
    let currentX = 0;
    let xOffset = 0;
    let yOffset = 0;

        // Touch events
        container.addEventListener('touchstart', (e) => {
            const thumbnail = e.target.closest('.page-thumbnail');
            if (thumbnail) {
                draggedElement = thumbnail;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                initialX = touchStartX - xOffset;
                initialY = touchStartY - yOffset;
                
                thumbnail.classList.add('dragging');
                e.preventDefault(); // Prevent scrolling while dragging
            }
        }, { passive: false });

        container.addEventListener('touchmove', (e) => {
            if (draggedElement) {
                e.preventDefault(); // Prevent scrolling while dragging
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
                
                xOffset = currentX;
                yOffset = currentY;
                
                setTranslate(currentX, currentY, draggedElement);
                
                // Find the element under the touch point
                const touch = e.touches[0];
                const elementUnderPoint = document.elementFromPoint(touch.clientX, touch.clientY);
                const targetThumbnail = elementUnderPoint?.closest('.page-thumbnail');
                
                if (targetThumbnail && targetThumbnail !== draggedElement) {
                    targetThumbnail.classList.add('drag-over');
                }
            }
        }, { passive: false });

        container.addEventListener('touchend', (e) => {
            if (draggedElement) {
                const target = e.changedTouches[0];
                const elementUnderPoint = document.elementFromPoint(target.clientX, target.clientY);
                const targetThumbnail = elementUnderPoint?.closest('.page-thumbnail');
                
                if (targetThumbnail && targetThumbnail !== draggedElement) {
                    const parent = container;
                    const draggedIndex = [...parent.children].indexOf(draggedElement);
                    const targetIndex = [...parent.children].indexOf(targetThumbnail);
                    
                    if (draggedIndex < targetIndex) {
                        parent.insertBefore(draggedElement, targetThumbnail.nextSibling);
                    } else {
                        parent.insertBefore(draggedElement, targetThumbnail);
                    }
                    
                    // Update page numbers after moving
                    updatePageNumbers();
                    
                    // Trigger auto-save
                    triggerAutoSave();
                }
                
                // Reset styles and position
                draggedElement.classList.remove('dragging');
                setTranslate(0, 0, draggedElement);
                draggedElement = null;
                
                // Remove drag-over class from all thumbnails
                container.querySelectorAll('.page-thumbnail').forEach(thumb => {
                    thumb.classList.remove('drag-over');
                });
            }
        });

    container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('page-thumbnail')) {
            draggedElement = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = "move"; 
        }
    });

    container.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('page-thumbnail')) {
            e.target.classList.remove('dragging');
            draggedElement = null;
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const thumbnail = e.target.closest('.page-thumbnail');
        if (thumbnail && thumbnail !== draggedElement) {
            thumbnail.classList.add('drag-over');
        }
    });

    container.addEventListener('dragleave', (e) => {
        const thumbnail = e.target.closest('.page-thumbnail');
        if (thumbnail) {
            thumbnail.classList.remove('drag-over');
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target.closest('.page-thumbnail');

        if (target && draggedElement && target !== draggedElement) {
            const parent = container;
            const draggedIndex = [...parent.children].indexOf(draggedElement);
            const targetIndex = [...parent.children].indexOf(target);

            if (draggedIndex < targetIndex) {
                parent.insertBefore(draggedElement, target.nextSibling);
            } else {
                parent.insertBefore(draggedElement, target);
            }

            // Remove highlight effect
            target.classList.remove('drag-over');

            // Update page numbers after moving
            updatePageNumbers();
            
            // // Trigger auto-save
            // triggerAutoSave();
        }
    });
}

// Helper function to set transform
function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
}

// Update page numbers after reordering
function updatePageNumbers() {
    const thumbnails = document.querySelectorAll('.page-thumbnail');
    thumbnails.forEach((thumb, index) => {
        // Store the original page number in a separate data attribute
        if (!thumb.dataset.originalPageNumber) {
            thumb.dataset.originalPageNumber = thumb.dataset.pageNumber;
        }
        thumb.dataset.currentPosition = index + 1;
        thumb.querySelector('.page-number').textContent = `Page ${index + 1}`;
    });
}

// // Trigger auto-save with debounce
// function triggerAutoSave() {
//     // Clear existing timeout
//     if (autoSaveTimeout) {
//         clearTimeout(autoSaveTimeout);
//     }

//     // Show saving status
//     autoSaveStatus.textContent = 'Saving changes...';
//     autoSaveStatus.classList.add('saving');

//     // Set new timeout
//     autoSaveTimeout = setTimeout(async () => {
//         try {
//             await saveReorganizedPDF();
//             autoSaveStatus.textContent = 'Changes saved';
//             autoSaveStatus.classList.remove('saving');
//             autoSaveStatus.classList.add('saved');
            
//             // Clear saved status after 2 seconds
//             setTimeout(() => {
//                 autoSaveStatus.classList.remove('saved');
//                 autoSaveStatus.textContent = '';
//             }, 2000);
//         } catch (error) {
//             console.error('Auto-save failed:', error);
//             autoSaveStatus.textContent = 'Auto-save failed';
//             autoSaveStatus.classList.remove('saving');
//             autoSaveStatus.classList.add('error');
//         }
//     }, 1000); // Wait 1 second after last change before saving
// }

// // Auto-save PDF
// async function saveReorganizedPDF() {
//     try {
//         showLoading();

//         const thumbnails = document.querySelectorAll('.page-thumbnail');
//         const newPageOrder = Array.from(thumbnails).map(thumb => ({
//             pageNumber: parseInt(thumb.dataset.originalPageNumber), // get original page index
//             rotation: parseInt(thumb.dataset.rotation || '0')
//         }));

//         console.log("Saving in this order:", newPageOrder.map(p => p.pageNumber));

//         const pdfBytes = await mergedPdfDoc.getData();
//         const sourcePdf = await PDFLib.PDFDocument.load(pdfBytes);
//         const newPdf = await PDFLib.PDFDocument.create();

//         for (const { pageNumber, rotation } of newPageOrder) {
//             const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNumber - 1]);
//             copiedPage.setRotation(PDFLib.degrees(rotation));
//             newPdf.addPage(copiedPage);
//         }

//         const modifiedPdfBytes = await newPdf.save();
//         const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
//         const url = URL.createObjectURL(blob);

//         const link = document.createElement('a');
//         link.href = url;
//         link.download = 'reorganized.pdf';
//         link.click();

//         URL.revokeObjectURL(url);
//     } catch (error) {
//         console.error('Error saving PDF:', error);
//         alert('Error saving PDF. Please try again.');
//     } finally {
//         hideLoading();
//     }
// }

// Save reorganized PDF
async function saveReorganizedPDF() {
    try {
        showLoading();
        
        const thumbnails = document.querySelectorAll('.page-thumbnail');

        // Create a new PDF document
        const pdfBytes = await mergedPdfDoc.getData();
        const sourcePdf = await PDFLib.PDFDocument.load(pdfBytes);
        const newPdf = await PDFLib.PDFDocument.create();

        // Copy pages in the current thumbnail order with rotation
        for (const thumb of thumbnails) {
            const pageNum = parseInt(thumb.dataset.originalPageNumber); // 1-based
            const rotation = parseInt(thumb.dataset.rotation || '0'); // default 0
            const flip = thumb.dataset.flip === 'horizontal';

            if (isNaN(pageNum)) continue;

            const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNum - 1]);

  // Apply horizontal flip if needed
  if (flip) {
    const { width, height } = copiedPage.getSize();

    // Create a new page with same dimensions
    const flippedPage = newPdf.addPage([width, height]);

    // Embed the original page content as an XObject
    const embeddedPage = await newPdf.embedPage(copiedPage);

    // Draw the flipped content on the new page
    flippedPage.drawPage(embeddedPage, {
        x: width,
        y: 0,
        xScale: -1,
        yScale: 1,
    });

    // Apply rotation after flip
    flippedPage.setRotation(PDFLib.degrees(rotation));

    continue; // already added flippedPage
}
            
            // Apply rotation
            copiedPage.setRotation(PDFLib.degrees(rotation));
            newPdf.addPage(copiedPage);
        }

        // Save the modified PDF
        const modifiedPdfBytes = await newPdf.save();
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = 'reorganized.pdf';
        link.click();

        // Cleanup
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error saving PDF:', error);
        alert('Error saving PDF. Please try again.');
    } finally {
        hideLoading();
    }
}


// Loading overlay functions
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}
