document.addEventListener('DOMContentLoaded', () => {
    const fileExtractorModal = document.getElementById('file-extractor-modal');
    const toolCard = document.getElementById('file-extractor-card');
    const closeButton = fileExtractorModal.querySelector('.close-button');
    const browseBtns = document.querySelectorAll('.browse-btn');
    const form = document.getElementById('extractor-form');
    const statusMessage = document.getElementById('status-message');

    let sourceDirHandle = null;
    let destDirHandle = null;

    toolCard.addEventListener('click', () => {
        fileExtractorModal.style.display = 'block';
    });

    closeButton.addEventListener('click', () => {
        fileExtractorModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === fileExtractorModal) {
            fileExtractorModal.style.display = 'none';
        }
    });

    browseBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetInput = document.getElementById(btn.dataset.target);
            try {
                const handle = await window.showDirectoryPicker();
                if (btn.dataset.target === 'source-dir') {
                    sourceDirHandle = handle;
                } else {
                    destDirHandle = handle;
                }
                targetInput.value = handle.name;
            } catch (err) {
                console.error('Error selecting directory:', err);
                statusMessage.textContent = 'Error selecting directory. Please try again.';
                statusMessage.className = 'error';
                statusMessage.style.display = 'block';
            }
        });
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!sourceDirHandle || !destDirHandle) {
            statusMessage.textContent = 'Please select both source and destination directories.';
            statusMessage.className = 'error';
            statusMessage.style.display = 'block';
            return;
        }

        const fileType = form.elements['file-type'].value.replace('.', '');
        const keepStructure = form.elements['keep-structure'].checked;
        statusMessage.textContent = 'Extracting files...';
        statusMessage.className = 'success';
        statusMessage.style.display = 'block';

        try {
            let filesExtracted = 0;
            let overwrittenFiles = [];
            let existingFilesInDest = new Set();

            async function directoryContainsMatchingFiles(dirHandle) {
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file' && entry.name.endsWith(`.${fileType}`)) {
                        return true;
                    }
                    if (entry.kind === 'directory') {
                        if (await directoryContainsMatchingFiles(entry)) {
                            return true;
                        }
                    }
                }
                return false;
            }

            async function processDirectory(source, destination, relativePath = '') {
                for await (const entry of source.values()) {
                    const currentRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                    if (entry.kind === 'file') {
                        if (entry.name.endsWith(`.${fileType}`)) {
                            const file = await entry.getFile();
                            let finalDestination = destination;
                            
                            if (!keepStructure) {
                                finalDestination = destDirHandle;
                                if (existingFilesInDest.has(entry.name)) {
                                    overwrittenFiles.push(currentRelativePath);
                                }
                                existingFilesInDest.add(entry.name);
                            }
                            
                            const newFileHandle = await finalDestination.getFileHandle(entry.name, { create: true });
                            const writable = await newFileHandle.createWritable();
                            await writable.write(file);
                            await writable.close();
                            filesExtracted++;
                        }
                    } else if (entry.kind === 'directory') {
                        if (keepStructure) {
                            if (await directoryContainsMatchingFiles(entry)) {
                                const newDirectoryHandle = await destination.getDirectoryHandle(entry.name, { create: true });
                                await processDirectory(entry, newDirectoryHandle, currentRelativePath);
                            }
                        } else {
                            await processDirectory(entry, destination, currentRelativePath);
                        }
                    }
                }
            }

            await processDirectory(sourceDirHandle, destDirHandle);

            let message = '';
            if (filesExtracted > 0) {
                message = `Successfully extracted and copied ${filesExtracted} file(s).`;
                if (overwrittenFiles.length > 0) {
                    message += `<br><br><strong>Warning: The following ${overwrittenFiles.length} file(s) were overwritten due to name conflicts:</strong><ul>`;
                    overwrittenFiles.forEach(path => {
                        message += `<li>${path}</li>`;
                    });
                    message += '</ul>';
                }
            } else {
                message = 'No files of the specified type were found.';
            }
            statusMessage.innerHTML = message;
            statusMessage.className = 'success';

        } catch (error) {
            console.error('Extraction error:', error);
            statusMessage.textContent = `An error occurred: ${error.message}`;
            statusMessage.className = 'error';
        }
        statusMessage.style.display = 'block';
    });
});
