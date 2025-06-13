export function initializeFileExtractor() {
    const extractorForm = document.getElementById('extractor-form');
    const statusMessage = document.getElementById('status-message');

    extractorForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const sourceHandle = window.directoryHandles['source-dir'];
        const destHandle = window.directoryHandles['dest-dir'];

        if (!sourceHandle || !destHandle) {
            statusMessage.textContent = 'Please select both source and destination directories.';
            statusMessage.className = 'error';
            statusMessage.style.display = 'block';
            return;
        }

        const fileType = extractorForm.elements['file-type'].value.replace('.', '');
        const keepStructure = extractorForm.elements['keep-structure'].checked;
        statusMessage.textContent = 'Extracting files...';
        statusMessage.className = 'success';
        statusMessage.style.display = 'block';

        try {
            let filesExtracted = 0;
            const overwrittenFiles = new Set();
            const writtenFiles = new Set();
            
            async function processDirectory(source, relativePath = '') {
                for await (const entry of source.values()) {
                    const currentRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                    if (entry.kind === 'file' && entry.name.endsWith(`.${fileType}`)) {
                        const file = await entry.getFile();
                        
                        let finalDestinationHandle = destHandle;
                        if (keepStructure) {
                            finalDestinationHandle = await createNestedDirectory(destHandle, relativePath);
                        } else {
                            if (writtenFiles.has(entry.name)) {
                                overwrittenFiles.add(entry.name);
                            }
                            writtenFiles.add(entry.name);
                        }
                        
                        const newFileHandle = await finalDestinationHandle.getFileHandle(entry.name, { create: true });
                        const writable = await newFileHandle.createWritable();
                        await writable.write(file);
                        await writable.close();
                        filesExtracted++;
                    } else if (entry.kind === 'directory') {
                        await processDirectory(entry, currentRelativePath);
                    }
                }
            }
            
            async function createNestedDirectory(baseHandle, path) {
                let currentHandle = baseHandle;
                if (!path) return currentHandle;
                const parts = path.split('/').filter(p => p);
                for (const part of parts) {
                    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
                }
                return currentHandle;
            }

            await processDirectory(sourceHandle);

            let message = `Successfully extracted and copied ${filesExtracted} file(s).`;
            if (overwrittenFiles.size > 0) {
                message += `<br><br><strong>Warning: The following ${overwrittenFiles.size} file(s) were overwritten due to name conflicts:</strong><ul>`;
                overwrittenFiles.forEach(name => message += `<li>${name}</li>`);
                message += '</ul>';
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
}
