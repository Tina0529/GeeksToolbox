import { initializeFileExtractor } from './file-extractor.js';
import { initializeZipTool } from './zip-tool.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Global Handle Storage ---
    window.directoryHandles = {};

    // --- Centralized Modal Logic ---
    const modals = {
        'file-extractor-card': document.getElementById('file-extractor-modal'),
        'zip-tool-card': document.getElementById('zip-tool-modal')
    };

    // Open modal when a tool card is clicked
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', () => {
            const modal = modals[card.id];
            if (modal) {
                modal.style.display = 'block';
            }
        });
    });

    // Close modal when the close button (×) is clicked
    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });

    // Close modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });

    // --- Generic Browse Button Listener ---
    document.querySelectorAll('.browse-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetId = btn.dataset.target;
            const targetInput = document.getElementById(targetId);
            try {
                const handle = await window.showDirectoryPicker();
                window.directoryHandles[targetId] = handle;
                targetInput.value = handle.name;
            } catch (err) {
                console.error('Error selecting directory:', err);
                alert('Failed to select directory. Please check console for details.');
            }
        });
    });

    // --- Initialize Tool-Specific Logic ---
    initializeFileExtractor();
    initializeZipTool();
});
