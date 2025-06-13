document.addEventListener('DOMContentLoaded', () => {
    // --- Common Elements ---
    const browseBtns = document.querySelectorAll('.browse-btn');

    // --- File Extractor Elements ---
    const fileExtractorModal = document.getElementById('file-extractor-modal');
    const fileExtractorCard = document.getElementById('file-extractor-card');
    const fileExtractorCloseButton = fileExtractorModal.querySelector('.close-button');
    const extractorForm = document.getElementById('extractor-form');
    const statusMessage = document.getElementById('status-message');
    let fileExtractorSourceDirHandle = null;
    let fileExtractorDestDirHandle = null;

    // --- Batch Zip Tool Elements ---
    const zipToolModal = document.getElementById('zip-tool-modal');
    const zipToolCard = document.getElementById('zip-tool-card');
    const zipToolCloseButton = zipToolModal.querySelector('.close-button');
    const tabLinks = zipToolModal.querySelectorAll('.tab-link');
    const tabContents = zipToolModal.querySelectorAll('.tab-content');
    const compressForm = document.getElementById('compress-form');
    const decompressForm = document.getElementById('decompress-form');
    const decompressInPlaceCheckbox = document.getElementById('decompress-in-place');
    const decompressDestDirGroup = document.getElementById('decompress-dest-dir-group');
    const zipProgressQueue = document.getElementById('zip-progress-queue');
    let compressSourceDirHandle = null;
    let compressDestDirHandle = null;
    let decompressSourceDirHandle = null;
    let decompressDestDirHandle = null;

    // --- Modal Management ---
    const openModal = (modal) => modal.style.display = 'block';
    const closeModal = (modal) => modal.style.display = 'none';

    fileExtractorCard.addEventListener('click', () => openModal(fileExtractorModal));
    zipToolCard.addEventListener('click', () => openModal(zipToolModal));
    fileExtractorCloseButton.addEventListener('click', () => closeModal(fileExtractorModal));
    zipToolCloseButton.addEventListener('click', () => closeModal(zipToolModal));
    window.addEventListener('click', (event) => {
        if (event.target === fileExtractorModal) closeModal(fileExtractorModal);
        if (event.target === zipToolModal) closeModal(zipToolModal);
    });

    // --- Generic Directory Picker ---
    browseBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const targetInput = document.getElementById(btn.dataset.target);
            try {
                const handle = await window.showDirectoryPicker();
                const handles = {
                    'source-dir': (h) => fileExtractorSourceDirHandle = h,
                    'dest-dir': (h) => fileExtractorDestDirHandle = h,
                    'compress-source-dir': (h) => compressSourceDirHandle = h,
                    'compress-dest-dir': (h) => compressDestDirHandle = h,
                    'decompress-source-dir': (h) => decompressSourceDirHandle = h,
                    'decompress-dest-dir': (h) => decompressDestDirHandle = h,
                };
                handles[btn.dataset.target]?.(handle);
                targetInput.value = handle.name;
            } catch (err) {
                console.error('Error selecting directory:', err);
            }
        });
    });

    // --- File Extractor Logic (simplified for brevity, remains unchanged) ---
    extractorForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        // ... existing file extractor implementation ...
    });

    // --- Batch Zip Tool ---
    const MAX_CONCURRENT_TASKS = 3;
    let activeTasks = 0;
    const taskQueue = [];
    let uiUpdateScheduled = false;

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;
            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            // **FIX**: Don't clear the queue, just update the view
            updateQueueUI();
        });
    });

    decompressInPlaceCheckbox.addEventListener('change', () => {
        decompressDestDirGroup.style.display = decompressInPlaceCheckbox.checked ? 'none' : 'block';
    });

    function formatTime(seconds) {
        if (!isFinite(seconds)) return '...';
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        return `${minutes}m ${remainingSeconds}s`;
    }
    
    // **FIX**: Throttled UI updates for performance
    function scheduleUIUpdate() {
        if (uiUpdateScheduled) return;
        uiUpdateScheduled = true;
        requestAnimationFrame(() => {
            updateQueueUI();
            uiUpdateScheduled = false;
        });
    }

    function updateQueueUI() {
        const activeTab = document.querySelector('.tab-link.active').dataset.tab;
        const taskTypeToShow = activeTab === 'compress-tab' ? 'compress' : 'decompress';
        
        const tasksToDisplay = taskQueue.filter(task => task.type === taskTypeToShow);
        zipProgressQueue.innerHTML = '';

        if (tasksToDisplay.length === 0) {
             const infoMsg = taskTypeToShow === 'compress' ? 'No compression tasks.' : 'No decompression tasks.';
             zipProgressQueue.innerHTML = `<div class="progress-item"><span class="progress-item-name">${infoMsg}</span></div>`;
        }

        tasksToDisplay.forEach(task => {
            const item = document.createElement('div');
            item.className = 'progress-item';
            const percentage = task.totalFiles > 0 ? (task.processedFiles / task.totalFiles) * 100 : 0;
            
            let subStatus = '';
            if (task.status === 'processing' && task.totalFiles > 0) {
                const elapsedTime = (Date.now() - task.startTime) / 1000;
                const filesPerSecond = task.processedFiles / elapsedTime;
                const remainingFiles = task.totalFiles - task.processedFiles;
                const etr = filesPerSecond > 0 ? remainingFiles / filesPerSecond : Infinity;
                subStatus = `
                    <div class="progress-item-sub-status">
                        <span>${task.processedFiles} / ${task.totalFiles} files</span>
                        <span>ETR: ${formatTime(etr)}</span>
                    </div>
                    <div class="progress-bar-container"><div class="progress-bar" style="width: ${percentage}%"></div></div>
                `;
            } else if (task.status === 'counting') {
                 subStatus = `<div class="progress-item-sub-status"><span>Counting files...</span></div>`;
            }

            let statusHTML = `<span class="progress-item-status ${task.status}">${task.status}</span>`;
            let nameHTML = `<div class="progress-details"><span class="progress-item-name">${task.name}</span>${subStatus}</div>`;

            if (task.status === 'error') {
                nameHTML = `<div class="progress-details"><span class="progress-item-name">${task.name}</span><span class="progress-item-error">${task.errorMsg || 'Unknown error'}</span></div>`;
                statusHTML = `<button class="retry-btn" data-task-id="${task.id}">Retry</button>`;
            }

            item.innerHTML = nameHTML + statusHTML;
            zipProgressQueue.appendChild(item);
        });

        document.querySelectorAll('.retry-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const taskId = e.target.dataset.taskId;
                const task = taskQueue.find(t => t.id === taskId);
                if (task) {
                    task.status = 'waiting';
                    task.errorMsg = null;
                    task.processedFiles = 0;
                    scheduleUIUpdate();
                    runNextTask();
                }
            });
        });
    }
    
    async function runNextTask() {
        if (activeTasks >= MAX_CONCURRENT_TASKS) return;
        const task = taskQueue.find(t => t.status === 'waiting');
        if (!task) return;

        activeTasks++;
        task.status = 'processing';
        task.startTime = Date.now();
        scheduleUIUpdate();

        try {
            await task.action(task);
            task.status = 'success';
        } catch (err) {
            console.error(`Task failed for ${task.name}:`, err);
            task.status = 'error';
            if (err.name === 'NotAllowedError') {
                task.errorMsg = '目标位置已存在同名文件或文件夹，操作被中止。';
            } else {
                task.errorMsg = err.message;
            }
        } finally {
            activeTasks--;
            scheduleUIUpdate();
            runNextTask();
        }
    }

    function addTask(task) {
        taskQueue.push({ 
            ...task, 
            id: Date.now() + Math.random(),
            status: 'waiting', 
            errorMsg: null, 
            processedFiles: 0, 
            totalFiles: task.totalFiles || 0 
        });
        scheduleUIUpdate();
        runNextTask();
    }

    async function countFiles(dirHandle) {
        let count = 0;
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') count++;
            else if (entry.kind === 'directory') count += await countFiles(entry);
        }
        return count;
    }

    compressForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!compressSourceDirHandle || !compressDestDirHandle) return alert('Please select directories.');
        
        // Clear only old compression tasks
        for (let i = taskQueue.length - 1; i >= 0; i--) {
            if (taskQueue[i].type === 'compress') taskQueue.splice(i, 1);
        }
        scheduleUIUpdate();

        for await (const entry of compressSourceDirHandle.values()) {
            if (entry.kind === 'directory') {
                const task = {
                    name: `Compress: ${entry.name}`,
                    type: 'compress',
                    action: (t) => compressDirectory(entry, compressDestDirHandle, t),
                    status: 'counting',
                    totalFiles: 0
                };
                addTask(task);
                countFiles(entry).then(count => {
                    task.totalFiles = count;
                    scheduleUIUpdate();
                });
            }
        }
    });

    async function compressDirectory(dirHandle, destHandle, task) {
        const zip = new JSZip();
        async function addFolderToZip(currentDirHandle, zipFolder) {
            for await (const entry of currentDirHandle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    zipFolder.file(entry.name, file);
                    task.processedFiles++;
                    scheduleUIUpdate();
                } else if (entry.kind === 'directory') {
                    await addFolderToZip(entry, zipFolder.folder(entry.name));
                }
            }
        }
        await addFolderToZip(dirHandle, zip);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const fileHandle = await destHandle.getFileHandle(`${dirHandle.name}.zip`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(zipBlob);
        await writable.close();
    }

    decompressForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const inPlace = decompressInPlaceCheckbox.checked;
        if (!decompressSourceDirHandle || (!inPlace && !decompressDestDirHandle)) return alert('Please select directories.');
        
        for (let i = taskQueue.length - 1; i >= 0; i--) {
            if (taskQueue[i].type === 'decompress') taskQueue.splice(i, 1);
        }
        scheduleUIUpdate();

        const recursive = document.getElementById('recursive-decompress').checked;
        async function findZipFiles(dirHandle, currentPath = '') {
            for await (const entry of dirHandle.values()) {
                const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.zip')) {
                    const dest = inPlace ? dirHandle : decompressDestDirHandle;
                    addTask({
                        name: `Decompress: ${newPath}`,
                        type: 'decompress',
                        action: (t) => decompressFile(entry, dest, t)
                    });
                } else if (entry.kind === 'directory' && recursive) {
                    await findZipFiles(entry, newPath);
                }
            }
        }
        await findZipFiles(decompressSourceDirHandle);
    });

    async function decompressFile(fileHandle, destHandle, task) {
        const file = await fileHandle.getFile();
        const zip = await JSZip.loadAsync(file);
        
        const fileEntries = Object.values(zip.files).filter(entry => !entry.dir);
        task.totalFiles = fileEntries.length;
        task.status = 'processing'; // Move from counting to processing
        scheduleUIUpdate();

        const targetDirName = file.name.replace(/\.zip$/i, '');
        const rootDirHandle = await destHandle.getDirectoryHandle(targetDirName, { create: true });

        const writePromises = fileEntries.map(async (entry) => {
            const blob = await entry.async('blob');
            const pathParts = entry.name.split('/').filter(p => p);
            const name = pathParts.pop();
            const dirHandle = await createNestedDirectory(rootDirHandle, pathParts.join('/'));
            const newFileHandle = await dirHandle.getFileHandle(name, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            task.processedFiles++;
            scheduleUIUpdate();
        });
        
        await Promise.all(writePromises);
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
});
