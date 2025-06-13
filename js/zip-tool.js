export function initializeZipTool() {
    const tabLinks = document.querySelectorAll('#zip-tool-modal .tab-link');
    const tabContents = document.querySelectorAll('#zip-tool-modal .tab-content');
    const compressForm = document.getElementById('compress-form');
    const decompressForm = document.getElementById('decompress-form');
    const decompressInPlaceCheckbox = document.getElementById('decompress-in-place');
    const decompressDestDirGroup = document.getElementById('decompress-dest-dir-group');
    const zipProgressQueue = document.getElementById('zip-progress-queue');

    const MAX_CONCURRENT_TASKS = 1;
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
        return `${minutes}m ${Math.round(seconds % 60)}s`;
    }

    function scheduleUIUpdate() {
        if (uiUpdateScheduled) return;
        uiUpdateScheduled = true;
        requestAnimationFrame(() => {
            updateQueueUI();
            uiUpdateScheduled = false;
        });
    }

    function updateQueueUI() {
        const activeTab = document.querySelector('#zip-tool-modal .tab-link.active').dataset.tab;
        const taskTypeToShow = activeTab === 'compress-tab' ? 'compress' : 'decompress';
        const tasksToDisplay = taskQueue.filter(task => task.type === taskTypeToShow);
        
        zipProgressQueue.innerHTML = '';
        if (tasksToDisplay.length === 0) {
            zipProgressQueue.innerHTML = `<div class="progress-item"><span class="progress-item-name">No active tasks.</span></div>`;
            return;
        }

        tasksToDisplay.forEach(task => {
            const item = document.createElement('div');
            item.className = 'progress-item';
            const percentage = task.totalFiles > 0 ? (task.processedFiles / task.totalFiles) * 100 : 0;
            
            let subStatus = '';
            if (task.status === 'processing' && task.totalFiles > 0) {
                const elapsedTime = (Date.now() - task.startTime) / 1000;
                const filesPerSecond = task.processedFiles / elapsedTime;
                const etr = filesPerSecond > 0 ? (task.totalFiles - task.processedFiles) / filesPerSecond : Infinity;
                subStatus = `
                    <div class="progress-item-sub-status">
                        <span>${task.processedFiles} / ${task.totalFiles} files</span>
                        <span>ETR: ${formatTime(etr)}</span>
                    </div>
                    <div class="progress-bar-container"><div class="progress-bar" style="width: ${percentage}%"></div></div>`;
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
                const taskId = parseFloat(e.target.dataset.taskId);
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
            task.errorMsg = err.name === 'NotAllowedError' ? 'A file or folder with the same name already exists at the destination.' : err.message;
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
        const sourceHandle = window.directoryHandles['compress-source-dir'];
        const destHandle = window.directoryHandles['compress-dest-dir'];
        if (!sourceHandle || !destHandle) return alert('Please select directories.');

        for await (const entry of sourceHandle.values()) {
            if (entry.kind === 'directory') {
                const task = {
                    name: `Compress: ${entry.name}`,
                    type: 'compress',
                    action: (t) => compressDirectory(entry, destHandle, t),
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
        const sourceHandle = window.directoryHandles['decompress-source-dir'];
        const destHandle = window.directoryHandles['decompress-dest-dir'];
        const inPlace = decompressInPlaceCheckbox.checked;
        if (!sourceHandle || (!inPlace && !destHandle)) return alert('Please select directories.');

        const recursive = document.getElementById('recursive-decompress').checked;
        async function findZipFiles(dirHandle, currentPath = '') {
            for await (const entry of dirHandle.values()) {
                const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.zip')) {
                    const finalDestHandle = inPlace ? dirHandle : destHandle;
                    addTask({
                        name: `Decompress: ${newPath}`,
                        type: 'decompress',
                        action: (t) => decompressFile(entry, finalDestHandle, t)
                    });
                } else if (entry.kind === 'directory' && recursive) {
                    await findZipFiles(entry, newPath);
                }
            }
        }
        await findZipFiles(sourceHandle);
    });

    async function decompressFile(fileHandle, destHandle, task) {
        const file = await fileHandle.getFile();
        const zip = await JSZip.loadAsync(file, {
            decodeFileName: function(bytes) {
                try {
                    // Try UTF-8 first, as it's the modern standard.
                    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                } catch (e) {
                    // If UTF-8 decoding fails, fall back to Shift_JIS for Japanese filenames.
                    return new TextDecoder('shift-jis').decode(bytes);
                }
            }
        });
        
        const fileEntries = Object.values(zip.files).filter(entry => !entry.dir);
        task.totalFiles = fileEntries.length;
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
}
