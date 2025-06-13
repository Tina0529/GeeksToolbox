document.addEventListener('DOMContentLoaded', () => {
    // 全局变量
    let sourceDirHandle = null;
    let targetDirHandle = null;

    // DOM 元素
    const fileExtractorCard = document.getElementById('file-extractor-card');
    const modalBackdrop = document.getElementById('file-extractor-modal-backdrop');
    const closeModalBtn = document.getElementById('close-modal-btn');
    
    const selectSourceBtn = document.getElementById('select-source-btn');
    const selectTargetBtn = document.getElementById('select-target-btn');
    const startExtractionBtn = document.getElementById('start-extraction-btn');
    
    const sourcePathDisplay = document.getElementById('source-path');
    const targetPathDisplay = document.getElementById('target-path');
    const fileTypeSelect = document.getElementById('file-type-select');
    const logOutput = document.getElementById('log-output');

    // --- 模态框控制 ---
    fileExtractorCard.addEventListener('click', () => {
        modalBackdrop.classList.add('visible');
    });

    closeModalBtn.addEventListener('click', () => {
        modalBackdrop.classList.remove('visible');
    });

    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
            modalBackdrop.classList.remove('visible');
        }
    });

    // --- 日志函数 ---
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const color = type === 'success' ? 'var(--color-success)' : type === 'error' ? '#ff4d4d' : 'var(--text-main)';
        logOutput.innerHTML += `<span style="color: ${color};">[${timestamp}] ${message}</span>\n`;
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    // --- 检查按钮状态 ---
    function checkStartButtonState() {
        if (sourceDirHandle && targetDirHandle) {
            startExtractionBtn.disabled = false;
        } else {
            startExtractionBtn.disabled = true;
        }
    }
    
    // --- 按钮事件监听 ---
    selectSourceBtn.addEventListener('click', async () => {
        try {
            sourceDirHandle = await window.showDirectoryPicker();
            sourcePathDisplay.textContent = `已选择: ${sourceDirHandle.name}`;
            log(`源目录已选择: ${sourceDirHandle.name}`);
            checkStartButtonState();
        } catch (err) {
            log(`选择源目录失败: ${err.message}`, 'error');
        }
    });

    selectTargetBtn.addEventListener('click', async () => {
        try {
            targetDirHandle = await window.showDirectoryPicker();
            targetPathDisplay.textContent = `已选择: ${targetDirHandle.name}`;
            log(`目标目录已选择: ${targetDirHandle.name}`);
            checkStartButtonState();
        } catch (err) {
            log(`选择目标目录失败: ${err.message}`, 'error');
        }
    });

    startExtractionBtn.addEventListener('click', async () => {
        if (!sourceDirHandle || !targetDirHandle) {
            log('请先选择源目录和目标目录。', 'error');
            return;
        }

        startExtractionBtn.disabled = true;
        log('提取任务开始...');
        
        const fileExtension = fileTypeSelect.value;
        let filesFound = 0;
        let filesCopied = 0;

        try {
            // 递归处理目录的函数
            async function processDirectory(directoryHandle) {
                for await (const entry of directoryHandle.values()) {
                    if (entry.kind === 'file') {
                        if (entry.name.endsWith(fileExtension)) {
                            filesFound++;
                            log(`发现文件: ${entry.name}`);
                            try {
                                const sourceFile = await entry.getFile();
                                const newFileHandle = await targetDirHandle.getFileHandle(entry.name, { create: true });
                                const writable = await newFileHandle.createWritable();
                                await writable.write(sourceFile);
                                await writable.close();
                                filesCopied++;
                                log(`  -> 已成功复制到目标目录。`, 'success');
                            } catch (copyError) {
                                log(`  -> 复制文件失败: ${copyError.message}`, 'error');
                            }
                        }
                    } else if (entry.kind === 'directory') {
                        log(`正在扫描子目录: ${entry.name}`);
                        await processDirectory(entry);
                    }
                }
            }

            await processDirectory(sourceDirHandle);
            log(`\n任务完成！共发现 ${filesFound} 个匹配文件，成功复制 ${filesCopied} 个。`, 'success');

        } catch (err) {
            log(`提取过程中发生错误: ${err.message}`, 'error');
        } finally {
            startExtractionBtn.disabled = false;
        }
    });

    // --- API 支持检查 ---
    if (!('showDirectoryPicker' in window)) {
        log('您的浏览器不支持文件系统访问 API，请使用最新版 Chrome 或 Edge。', 'error');
        document.querySelectorAll('.btn, .dropdown').forEach(el => el.disabled = true);
    } else {
        log('欢迎使用文件提取器！');
    }
});