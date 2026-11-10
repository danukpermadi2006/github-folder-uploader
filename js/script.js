/* ==========================================================
   GitHub Manager - script.js (semua interaksi)
   Dimuat dengan defer di index.html (setelah Tailwind, JSZip, Ace).
   ========================================================== */

// ---- Helper keamanan: escape teks tak tepercaya (nama file/repo/branch) sebelum masuk innerHTML ----
function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let selectedFiles = []; 
let strippedFiles = []; 
let isUploading = false;
let uploadAbortController = null;

let userReposCache = [];
let repoBranchesCache = [];
let currentOwner = '';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Token History
let tokenHistoryList = JSON.parse(localStorage.getItem('ghManagerTokens') || '[]');

// Editor State
let currentTreeData = [];
let activeTreeSelection = null; 
let editingFilePath = null;
let editingFileSha = null;
let originalFileContent = "";
let aceEditor = null; 
let pendingCreateType = 'file';

const DOM = {
    token: document.getElementById('gh-token'),
    rememberToken: document.getElementById('remember-token'),
    toggleToken: document.getElementById('toggle-token'),
    dropdownTokenHistory: document.getElementById('dropdown-token-history'),
    btnLoadAccount: document.getElementById('btn-load-account'),
    btnLogout: document.getElementById('btn-logout'),
    userAvatar: document.getElementById('user-avatar'),
    avatarGlow: document.getElementById('avatar-glow'),
    alertBox: document.getElementById('alert-box'),
    rateLimitBadge: document.getElementById('rate-limit-badge'),
    rateLimitVal: document.getElementById('rate-limit-val'),

    navTabs: document.querySelectorAll('.nav-tab'),
    tabContents: document.querySelectorAll('.tab-content'),

    repo: document.getElementById('gh-repo'),
    branch: document.getElementById('gh-branch'),
    dropdownRepo: document.getElementById('dropdown-repo'),
    dropdownBranch: document.getElementById('dropdown-branch'),
    btnNewBranchPrompt: document.getElementById('btn-new-branch-prompt'),

    path: document.getElementById('gh-path'),
    message: document.getElementById('gh-message'),
    inputFile: document.getElementById('input-file'),
    inputFolder: document.getElementById('input-folder'),
    inputZip: document.getElementById('input-zip'),
    btnZipTrigger: document.getElementById('btn-zip-trigger'),
    fileSection: document.getElementById('file-section'),
    fileCount: document.getElementById('file-count'),
    fileListBody: document.getElementById('file-list-body'),
    btnClearFiles: document.getElementById('btn-clear-files'),
    stripRoot: document.getElementById('strip-root'),
    autoRoute: document.getElementById('auto-route'),
    btnUpload: document.getElementById('btn-upload'),
    btnCancelUpload: document.getElementById('btn-cancel-upload'),
    progressContainer: document.getElementById('progress-container'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    progressPercentage: document.getElementById('progress-percentage'),
    progressDetail: document.getElementById('progress-detail'),

    btnFetchTree: document.getElementById('btn-fetch-tree'),
    btnTreeOrganize: document.getElementById('btn-tree-organize'),
    btnTreeDownloadRepo: document.getElementById('btn-tree-download-repo'),
    btnNewFile: document.getElementById('btn-new-file'),
    btnNewFolder: document.getElementById('btn-new-folder'),
    btnTreeDownload: document.getElementById('btn-tree-download'),
    btnTreeMove: document.getElementById('btn-tree-move'),
    btnTreeDelete: document.getElementById('btn-tree-delete'),
    btnTreeDeleteAll: document.getElementById('btn-tree-delete-all'),
    lblActiveRepo: document.getElementById('lbl-active-repo'),
    repoTreeView: document.getElementById('repo-tree-view'),
    treeLoading: document.getElementById('tree-loading'),

    editorPlaceholder: document.getElementById('editor-placeholder'),
    fileEditor: document.getElementById('file-editor'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    imagePreviewImg: document.getElementById('image-preview-img'),
    editorFilePath: document.getElementById('editor-file-path'),
    editorLoading: document.getElementById('editor-loading'),
    editorLoadingText: document.getElementById('editor-loading-text'),
    btnSearchFile: document.getElementById('btn-search-file'),
    btnSaveFile: document.getElementById('btn-save-file'),
    commitMsgContainer: document.getElementById('commit-msg-container'),
    editCommitMsg: document.getElementById('edit-commit-msg'),

    newRepoName: document.getElementById('new-repo-name'),
    newRepoDesc: document.getElementById('new-repo-desc'),
    newRepoInit: document.getElementById('new-repo-init'),
    btnCreateRepo: document.getElementById('btn-create-repo'),
    delRepoName: document.getElementById('del-repo-name'),
    dropdownDelRepo: document.getElementById('dropdown-del-repo'),
    btnTriggerDelete: document.getElementById('btn-trigger-delete'),
    lblCreateOwner: document.getElementById('lbl-create-owner'),

    modalBranch: document.getElementById('modal-branch'),
    modalBranchContent: document.getElementById('modal-branch-content'),
    newBranchName: document.getElementById('new-branch-name'),
    lblSourceBranch: document.getElementById('lbl-source-branch'),
    btnConfirmBranch: document.getElementById('btn-confirm-branch'),

    modalDelete: document.getElementById('modal-delete'),
    modalContent: document.getElementById('modal-delete-content'),
    modalTarget: document.getElementById('modal-repo-target'),
    btnCancelDel: document.getElementById('btn-cancel-delete'),
    btnConfirmDel: document.getElementById('btn-confirm-delete'),

    modalDeleteFile: document.getElementById('modal-delete-file'),
    modalDelFileContent: document.getElementById('modal-delete-file-content'),
    modalFileTarget: document.getElementById('modal-file-target'),
    btnConfirmDelFile: document.getElementById('btn-confirm-delete-file'),
    delFileCommitMsg: document.getElementById('del-file-commit-msg'),

    modalDeleteAll: document.getElementById('modal-delete-all'),
    modalDeleteAllContent: document.getElementById('modal-delete-all-content'),
    btnConfirmDelAll: document.getElementById('btn-confirm-delete-all'),
    delAllCommitMsg: document.getElementById('del-all-commit-msg'),

    modalCreate: document.getElementById('modal-create'),
    modalCreateContent: document.getElementById('modal-create-content'),
    modalCreateTitle: document.getElementById('modal-create-title'),
    createItemPath: document.getElementById('create-item-path'),
    btnConfirmCreate: document.getElementById('btn-confirm-create'),

    modalMove: document.getElementById('modal-move'),
    modalMoveContent: document.getElementById('modal-move-content'),
    moveItemPath: document.getElementById('move-item-path'),
    btnConfirmMove: document.getElementById('btn-confirm-move')
};

function init() {
    const savedSettings = JSON.parse(localStorage.getItem('ghManagerSettingsV3') || '{}');
    if (savedSettings.rememberToken && savedSettings.token) {
        DOM.token.value = savedSettings.token;
        DOM.rememberToken.checked = true;
        checkTokenLength();
    }
    if (savedSettings.owner) {
        currentOwner = savedSettings.owner;
        DOM.lblCreateOwner.textContent = currentOwner;
        DOM.btnLogout.classList.remove('hidden');
    }
    if (savedSettings.repo) DOM.repo.value = savedSettings.repo;
    if (savedSettings.branch) DOM.branch.value = savedSettings.branch;
    if (savedSettings.path) DOM.path.value = savedSettings.path;
    if (savedSettings.autoRoute !== undefined) DOM.autoRoute.checked = savedSettings.autoRoute;

    DOM.toggleToken.addEventListener('click', () => {
        const isPass = DOM.token.type === 'password';
        DOM.token.type = isPass ? 'text' : 'password';
        DOM.toggleToken.innerHTML = isPass ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
        DOM.toggleToken.classList.toggle('text-purple-400', isPass);
    });
    DOM.token.addEventListener('input', checkTokenLength);
    DOM.token.addEventListener('focus', renderTokenHistory);
    DOM.token.addEventListener('blur', () => setTimeout(() => DOM.dropdownTokenHistory.classList.add('hidden'), 200));
    DOM.btnLoadAccount.addEventListener('click', loadAccountData);
    DOM.btnLogout.addEventListener('click', executeLogout);

    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            DOM.navTabs.forEach(t => t.classList.remove('active'));
            DOM.tabContents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
            hideAlert();
        });
    });

    DOM.inputFile.addEventListener('change', handleFileSelection);
    DOM.inputFolder.addEventListener('change', handleFolderSelection);
    DOM.inputZip.addEventListener('change', handleZipSelection);
    setupDragAndDrop();

    DOM.stripRoot.addEventListener('change', updateFileList);
    DOM.autoRoute.addEventListener('change', () => { saveSettings(); updateFileList(); });
    DOM.btnClearFiles.addEventListener('click', () => { selectedFiles = []; updateFileList(); });

    DOM.btnUpload.addEventListener('click', startUpload);
    DOM.btnCancelUpload.addEventListener('click', cancelUpload);

    DOM.btnFetchTree.addEventListener('click', fetchRepositoryTree);
    DOM.btnTreeOrganize.addEventListener('click', executeSmartOrganize);
    DOM.btnTreeDownloadRepo.addEventListener('click', downloadEntireRepo);
    DOM.btnTreeDownload.addEventListener('click', downloadActiveTreeSelection);
    DOM.btnTreeDelete.addEventListener('click', promptDeleteActiveSelection);
    DOM.btnTreeDeleteAll.addEventListener('click', promptDeleteAll);
    DOM.btnTreeMove.addEventListener('click', promptMoveSelection);

    DOM.btnSearchFile.addEventListener('click', () => { if(aceEditor) aceEditor.execCommand("find"); });
    DOM.btnSaveFile.addEventListener('click', saveEditedFile);
    DOM.btnConfirmDelFile.addEventListener('click', executeDeleteSelection);
    DOM.btnConfirmDelAll.addEventListener('click', executeDeleteAll);
    DOM.btnConfirmMove.addEventListener('click', () => executeMoveItem(DOM.moveItemPath.value.trim(), activeTreeSelection));

    DOM.btnNewFile.addEventListener('click', () => promptCreateItem('file'));
    DOM.btnNewFolder.addEventListener('click', () => promptCreateItem('folder'));
    DOM.btnConfirmCreate.addEventListener('click', executeCreateItem);

    DOM.btnNewBranchPrompt.addEventListener('click', () => {
        if(!currentOwner || !DOM.repo.value.trim() || !DOM.branch.value.trim()) return showAlert("Load a repo and branch first.");
        DOM.lblSourceBranch.textContent = DOM.branch.value.trim();
        DOM.newBranchName.value = "";
        openModal('modal-branch', 'modal-branch-content');
    });
    DOM.btnConfirmBranch.addEventListener('click', executeCreateBranch);

    if (window.ace) {
        ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.2/');
        aceEditor = ace.edit("file-editor");
        aceEditor.setTheme("ace/theme/one_dark");
        aceEditor.setOptions({
            fontSize: window.innerWidth < 768 ? "11px" : "13px",
            fontFamily: "'JetBrains Mono', monospace",
            wrap: true,
            showPrintMargin: false,
            readOnly: true,
            useWorker: false 
        });

        aceEditor.on('change', () => {
            if(!editingFilePath) return;
            const currentVal = aceEditor.getValue();
            if(currentVal !== originalFileContent) {
                DOM.btnSaveFile.classList.add('btn-action', 'btn-blue');
                DOM.btnSaveFile.classList.remove('opacity-50');
                DOM.btnSaveFile.disabled = false;
            } else {
                DOM.btnSaveFile.classList.remove('btn-action', 'btn-blue');
                DOM.btnSaveFile.classList.add('opacity-50');
                DOM.btnSaveFile.disabled = true;
            }
        });
    }

    DOM.btnCreateRepo.addEventListener('click', createRepository);
    DOM.delRepoName.addEventListener('input', () => { DOM.btnTriggerDelete.disabled = DOM.delRepoName.value.trim() === ''; });
    DOM.btnTriggerDelete.addEventListener('click', () => {
        const repo = DOM.delRepoName.value.trim();
        if(!repo || !currentOwner) return;
        DOM.modalTarget.textContent = `${currentOwner}/${repo}`;
        DOM.btnConfirmDel.disabled = false; 
        openModal('modal-delete', 'modal-delete-content');
    });

    DOM.btnCancelDel.addEventListener('click', () => closeModal('modal-delete', 'modal-delete-content'));
    DOM.btnConfirmDel.addEventListener('click', executeDeleteRepository);

    setupAutocomplete(DOM.repo, DOM.dropdownRepo, () => userReposCache, onRepoSelected);
    setupAutocomplete(DOM.branch, DOM.dropdownBranch, () => repoBranchesCache);
    setupAutocomplete(DOM.delRepoName, DOM.dropdownDelRepo, () => userReposCache, (repo) => { DOM.btnTriggerDelete.disabled = false; });

    const saveInputs = [DOM.repo, DOM.branch, DOM.path, DOM.token, DOM.rememberToken];
    saveInputs.forEach(el => el.addEventListener('change', saveSettings));

    if(savedSettings.cachedRepos) userReposCache = savedSettings.cachedRepos;
}

function checkTokenLength() {
    const val = DOM.token.value.trim();
    const isValidFormat = /^(ghp_|github_pat_|gho_|ghu_|ghs_)[a-zA-Z0-9_.-]+$/.test(val);
    DOM.btnLoadAccount.classList.toggle('hidden', !isValidFormat && val.length < 15);
}

function saveTokenToHistory(token, username) {
    tokenHistoryList = tokenHistoryList.filter(t => t.token !== token);
    tokenHistoryList.unshift({ token, username, date: new Date().toISOString() });
    if (tokenHistoryList.length > 5) tokenHistoryList.pop(); // Keep last 5
    localStorage.setItem('ghManagerTokens', JSON.stringify(tokenHistoryList));
}

function renderTokenHistory() {
    if (tokenHistoryList.length === 0) return DOM.dropdownTokenHistory.classList.add('hidden');
    DOM.dropdownTokenHistory.innerHTML = '<div class="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">Saved Tokens</div>';

    tokenHistoryList.forEach(item => {
        const div = document.createElement('div');
        div.className = 'px-3 md:px-4 py-2 text-[10px] md:text-sm font-mono text-slate-300 hover:bg-purple-500/20 hover:text-white cursor-pointer transition-colors flex justify-between items-center';
        div.innerHTML = `<span><i class="fas fa-user-circle mr-1.5 text-purple-400"></i>${escapeHtml(item.username)}</span> <span class="text-[9px] opacity-50">${item.token.substring(0, 8)}...</span>`;
        div.addEventListener('mousedown', (e) => { 
            e.preventDefault(); 
            DOM.token.value = item.token;
            DOM.dropdownTokenHistory.classList.add('hidden');
            checkTokenLength();
            loadAccountData();
        });
        DOM.dropdownTokenHistory.appendChild(div);
    });
    DOM.dropdownTokenHistory.classList.remove('hidden');
}

function executeLogout() {
    localStorage.removeItem('ghManagerSettingsV3');
    location.reload();
}

function saveSettings() {
    const settings = {
        owner: currentOwner,
        repo: DOM.repo.value.trim(),
        branch: DOM.branch.value.trim(),
        path: DOM.path.value.trim(),
        rememberToken: DOM.rememberToken.checked,
        token: DOM.rememberToken.checked ? DOM.token.value.trim() : '',
        cachedRepos: userReposCache,
        autoRoute: DOM.autoRoute.checked
    };
    localStorage.setItem('ghManagerSettingsV3', JSON.stringify(settings));
}

function showAlert(message, type = 'error') {
    DOM.alertBox.className = `mt-2 md:mt-3 mb-4 p-2.5 md:p-4 rounded-lg md:rounded-xl text-[10px] md:text-sm font-medium border flex items-start gap-2 shadow-inner relative z-10 ${
        type === 'error' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 
        'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    }`;
    DOM.alertBox.innerHTML = `<div class="mt-0.5"><i class="fas ${type === 'error' ? 'fa-times-circle' : 'fa-check-circle'} text-sm md:text-base"></i></div><div class="leading-relaxed flex-1">${message}</div>`;
    DOM.alertBox.classList.remove('hidden');
    if (type === 'success') setTimeout(hideAlert, 7000); 
}
function hideAlert() { DOM.alertBox.classList.add('hidden'); }

function updateRateLimitUI(res) {
    const limitRemaining = res.headers.get('x-ratelimit-remaining');
    if (limitRemaining) {
        DOM.rateLimitBadge.classList.remove('hidden');
        DOM.rateLimitVal.textContent = limitRemaining;
        if (parseInt(limitRemaining) < 50) DOM.rateLimitBadge.classList.replace('text-slate-300', 'text-amber-400');
        if (parseInt(limitRemaining) < 10) DOM.rateLimitBadge.classList.replace('text-amber-400', 'text-rose-400');
    }
}

async function ghApi(endpoint, method = 'GET', body = null, signal = null) {
    const token = DOM.token.value.trim();
    if (!token) throw new Error("GitHub Token is required.");

    const options = {
        method,
        headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `Bearer ${token}` }
    };
    if (body) options.body = JSON.stringify(body);
    if (signal) options.signal = signal;

    const res = await fetch(`https://api.github.com/${endpoint}`, options);
    updateRateLimitUI(res);

    if (res.status === 204) return null; 
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
            throw new Error("API Rate Limit Exceeded. Please try again later.");
        }
        throw new Error(data.message || `HTTP ${res.status}`);
    }
    return data;
}

async function ghApiPaginated(endpoint) {
    const token = DOM.token.value.trim();
    if (!token) throw new Error("GitHub Token is required.");

    let results = [];
    let url = `https://api.github.com/${endpoint}`;

    while(url) {
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `Bearer ${token}` } });
        updateRateLimitUI(res);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

        results = results.concat(data);
        const linkHeader = res.headers.get('Link');
        url = null;
        if (linkHeader) {
            const links = linkHeader.split(',');
            const nextLink = links.find(link => link.includes('rel="next"'));
            if (nextLink) url = nextLink.match(/<([^>]+)>/)[1];
        }
    }
    return results;
}

async function loadAccountData() {
    const token = DOM.token.value.trim();
    if (!token) return showAlert('Please enter GitHub Token first.');

    hideAlert();
    const originalHtml = DOM.btnLoadAccount.innerHTML;
    DOM.btnLoadAccount.innerHTML = `<div class="spinner-cyber !w-4 !h-4 mx-auto"></div>`;
    DOM.btnLoadAccount.disabled = true;

    try {
        const user = await ghApi('user');
        currentOwner = user.login;
        DOM.lblCreateOwner.textContent = currentOwner;
        DOM.userAvatar.src = user.avatar_url;
        DOM.avatarGlow.classList.replace('from-purple-500', 'from-emerald-400');
        DOM.avatarGlow.classList.replace('to-fuchsia-500', 'to-cyan-400');
        DOM.btnLogout.classList.remove('hidden');

        saveTokenToHistory(token, currentOwner);

        const repos = await ghApiPaginated('user/repos?per_page=100&sort=updated');
        userReposCache = repos.map(r => r.name);

        showAlert(`Connected as <strong>${escapeHtml(currentOwner)}</strong>. Loaded ${repos.length} repositories.`, 'success');
        saveSettings();
    } catch (err) {
        showAlert('Failed to load account. Make sure the token is valid. ' + err.message);
    } finally {
        DOM.btnLoadAccount.innerHTML = originalHtml;
        DOM.btnLoadAccount.disabled = false;
    }
}

function setupAutocomplete(inputEl, dropdownEl, getItemsFn, onSelectCb) {
    const render = () => {
        const items = typeof getItemsFn === 'function' ? getItemsFn() : getItemsFn;
        if (!items || items.length === 0) return dropdownEl.classList.add('hidden');

        const query = inputEl.value.toLowerCase();
        const filtered = items.filter(item => item.toLowerCase().includes(query));

        dropdownEl.innerHTML = '';
        if (filtered.length === 0) return dropdownEl.classList.add('hidden');

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'px-3 md:px-4 py-2 text-[10px] md:text-sm font-mono text-slate-300 hover:bg-purple-500/20 hover:text-white cursor-pointer transition-colors';
            div.innerHTML = `<i class="fas fa-book mr-1.5 opacity-50 text-[10px]"></i>${escapeHtml(item)}`;

            div.addEventListener('mousedown', (e) => { 
                e.preventDefault();
                inputEl.value = item;
                dropdownEl.classList.add('hidden');
                saveSettings();
                if(onSelectCb) onSelectCb(item);
            });
            dropdownEl.appendChild(div);
        });
        dropdownEl.classList.remove('hidden');
    };

    inputEl.addEventListener('focus', render);
    inputEl.addEventListener('input', render);
    inputEl.addEventListener('blur', () => setTimeout(() => dropdownEl.classList.add('hidden'), 200));
}

async function onRepoSelected(repoName) {
    if (!currentOwner || !repoName) return;
    DOM.branch.value = 'Loading...';
    repoBranchesCache = [];

    DOM.repoTreeView.innerHTML = '<div class="text-slate-500 text-center mt-10 italic">Click the sitemap icon to view contents.</div>';
    resetEditor();

    try {
        const repoData = await ghApi(`repos/${currentOwner}/${repoName}`);
        DOM.branch.value = repoData.default_branch || 'main';

        const branches = await ghApiPaginated(`repos/${currentOwner}/${repoName}/branches?per_page=100`);
        repoBranchesCache = branches.map(b => b.name);
        saveSettings();
    } catch (e) {
        DOM.branch.value = 'main';
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
}

function getCommonRoot(paths) {
    if (paths.length === 0) return '';
    let splitPaths = paths.map(p => p.split('/'));
    let minLen = Math.min(...splitPaths.map(p => p.length));
    if (minLen <= 1) return ''; 
    let common = [];
    for (let i = 0; i < minLen - 1; i++) { 
        let current = splitPaths[0][i];
        if (splitPaths.every(p => p[i] === current)) common.push(current);
        else break;
    }
    return common.length > 0 ? common.join('/') + '/' : '';
}

function blobToBase64(blob) {
    return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
    });
}

function filterFiles(filesList, isWebKitDir = false) {
    selectedFiles = [];
    let hasLargeFiles = false;
    for (let f of filesList) {
        if (f.size > MAX_FILE_SIZE) { hasLargeFiles = true; continue; }
        const path = isWebKitDir ? f.webkitRelativePath : f.name;
        selectedFiles.push({ originalPath: path, fileData: f, size: f.size, isDir: false });
    }
    if (hasLargeFiles) showAlert("Some files were skipped because they exceed the 100MB limit.", "error");
    else hideAlert();
    updateFileList();
}

function handleFileSelection(e) { if(e.target.files.length) filterFiles(e.target.files, false); DOM.inputFile.value = ''; }
function handleFolderSelection(e) { if(e.target.files.length) filterFiles(e.target.files, true); DOM.inputFolder.value = ''; }

async function handleZipSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    hideAlert();
    DOM.fileSection.classList.add('hidden');
    const originalBtnHtml = DOM.btnZipTrigger.innerHTML;
    DOM.btnZipTrigger.innerHTML = `<div class="spinner-cyber mb-2"></div><span class="text-fuchsia-400 font-bold text-[10px] md:text-sm z-10 relative">Extracting...</span>`;

    try {
        const zip = await JSZip.loadAsync(file);
        selectedFiles = [];
        const promises = [];
        let hasLargeFiles = false;

        zip.forEach((relativePath, zipEntry) => {
            if (relativePath.includes('__MACOSX/') || relativePath.endsWith('.DS_Store')) return;
            if (zipEntry.dir) {
                selectedFiles.push({ originalPath: relativePath, size: 0, isDir: true, fileData: null });
            } else {
                promises.push(
                    zipEntry.async('blob').then(blob => {
                        if (blob.size > MAX_FILE_SIZE) { hasLargeFiles = true; return; }
                        selectedFiles.push({ originalPath: relativePath, fileData: blob, size: blob.size, isDir: false });
                    })
                );
            }
        });
        await Promise.all(promises);
        if (hasLargeFiles) showAlert("Some files in ZIP were skipped (max 100MB limit).", "error");
        updateFileList();
    } catch (err) { showAlert("Failed to read ZIP: " + err.message); } 
    finally { DOM.inputZip.value = ''; DOM.btnZipTrigger.innerHTML = originalBtnHtml; }
}

function setupDragAndDrop() {
    const dropZones = document.querySelectorAll('.upload-area');
    dropZones.forEach(dropZone => {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false));
        ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, () => dropZone.classList.add('drag-over'), false));
        ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, () => dropZone.classList.remove('drag-over'), false));
    });
}

function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9.\-_]/g, '-');
}

function updateFileList() {
    if (selectedFiles.length === 0) { DOM.fileSection.classList.add('hidden'); return; }
    DOM.fileSection.classList.remove('hidden');

    let rootToStrip = DOM.stripRoot.checked ? getCommonRoot(selectedFiles.map(f => f.originalPath)) : '';
    const doAutoRoute = DOM.autoRoute.checked;

    strippedFiles = selectedFiles.map((f, index) => {
        let displayPath = f.originalPath;
        if (rootToStrip && displayPath.startsWith(rootToStrip)) {
            displayPath = displayPath.substring(rootToStrip.length);
        }

        if (doAutoRoute && !f.isDir) {
            const parts = displayPath.split('/');
            let fileName = parts.pop();
            fileName = sanitizeFileName(fileName); 
            const ext = fileName.split('.').pop().toLowerCase();

            const imgExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
            if (imgExtensions.includes(ext)) {
                if (!displayPath.startsWith('images/')) displayPath = 'images/' + fileName;
            } else if (ext === 'enc') {
                if (!displayPath.startsWith('data/')) displayPath = 'data/' + fileName;
            } else {
                // Reconstruct path with sanitized filename
                displayPath = parts.length > 0 ? parts.join('/') + '/' + fileName : fileName;
            }
        }

        return { ...f, displayPath, originalIndex: index };
    }).filter(f => f.displayPath !== ''); 

    DOM.fileListBody.innerHTML = '';
    const visibleFiles = [];
    for (let file of strippedFiles) {
        if (file.isDir && !strippedFiles.some(f => !f.isDir && f.displayPath.startsWith(file.displayPath))) visibleFiles.push(file);
        else if (!file.isDir) visibleFiles.push(file);
    }

    DOM.fileCount.textContent = visibleFiles.length;
    visibleFiles.forEach((file) => {
        const tr = document.createElement('tr');
        tr.className = `hover:bg-white/[0.02] transition-colors`;
        tr.innerHTML = `
            <td class="px-2 md:px-3 py-2 truncate max-w-[120px] sm:max-w-[200px]" title="${file.displayPath}"><i class="${file.isDir ? 'fas fa-folder text-amber-500' : 'far fa-file-code text-purple-400'} mr-2 opacity-80"></i>${file.displayPath}</td>
            <td class="px-2 md:px-3 py-2 text-right text-slate-500 whitespace-nowrap">${file.isDir ? '-' : formatBytes(file.size)}</td>
            <td class="px-2 md:px-3 py-2 text-center"><button type="button" class="text-rose-500/70 hover:text-rose-400 p-1 rounded transition" onclick="removeFile(${file.originalIndex})"><i class="fas fa-trash-alt"></i></button></td>
        `;
        DOM.fileListBody.appendChild(tr);
    });
}
window.removeFile = function(idx) { selectedFiles.splice(idx, 1); updateFileList(); };

function setUpdate(text, progress) {
    DOM.progressText.textContent = text;
    DOM.progressDetail.textContent = text;
    DOM.progressPercentage.textContent = Math.round(progress) + '%';
    DOM.progressBar.style.width = progress + '%';
}

function cancelUpload() {
    if (uploadAbortController) {
        uploadAbortController.abort();
        isUploading = false;
        DOM.progressContainer.classList.add('hidden');
        DOM.btnCancelUpload.classList.add('hidden');
        DOM.btnUpload.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> <span class="relative z-10">Upload to GitHub</span>`;
        DOM.btnUpload.disabled = false;
        showAlert("Upload aborted by user.", "error");
    }
}

async function startUpload() {
    if (isUploading) return;
    if (strippedFiles.length === 0) return showAlert("No files in queue.");

    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    if (!currentOwner || !repo || !branch) return showAlert("Owner, Repo, and Branch are required. Make sure Account is loaded.");

    hideAlert(); isUploading = true;
    uploadAbortController = new AbortController();
    const signal = uploadAbortController.signal;

    DOM.btnUpload.innerHTML = `<div class="spinner-cyber !w-4 !h-4 inline-block mr-2 align-middle"></div> <span class="uppercase tracking-widest text-sm relative z-10">Uploading...</span>`;
    DOM.btnUpload.disabled = true;
    DOM.btnCancelUpload.classList.remove('hidden');
    DOM.progressContainer.classList.remove('hidden');

    try {
        const basePath = DOM.path.value.trim().replace(/^\/|\/$/g, ''); 
        const commitMsg = DOM.message.value.trim() || "Upload files via Web Manager";

        let repoInfo = await ghApi(`repos/${currentOwner}/${repo}`, 'GET', null, signal);
        const defaultBranch = repoInfo.default_branch;

        setUpdate("Checking Branch...", 5);
        let latestCommitSha, baseTreeSha, isNewBranch = false;

        try {
            latestCommitSha = (await ghApi(`repos/${currentOwner}/${repo}/git/ref/heads/${branch}`, 'GET', null, signal)).object.sha;
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            setUpdate(`Cloning from default branch (${defaultBranch})...`, 10);
            latestCommitSha = (await ghApi(`repos/${currentOwner}/${repo}/git/ref/heads/${defaultBranch}`, 'GET', null, signal)).object.sha;
            isNewBranch = true;
        }

        baseTreeSha = (await ghApi(`repos/${currentOwner}/${repo}/git/commits/${latestCommitSha}`, 'GET', null, signal)).tree.sha;

        const filesToUpload = [], treeEntries = [];
        for (let file of strippedFiles) {
            if (file.isDir && !strippedFiles.some(f => !f.isDir && f.displayPath.startsWith(file.displayPath))) 
                filesToUpload.push({ path: file.displayPath.replace(/\/$/, '') + '/.gitkeep', content: '', isBinary: false });
            else if (!file.isDir) filesToUpload.push({ path: file.displayPath, blobData: file.fileData, isBinary: true });
        }

        const concurrencyLimit = 5;
        let activePromises = [], processedCount = 0;

        for (let i = 0; i < filesToUpload.length; i++) {
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");

            const item = filesToUpload[i];
            let fullPath = basePath ? `${basePath}/${item.path}` : item.path;

            const uploadTask = (async () => {
                let blobSha;
                if (!item.isBinary) {
                    blobSha = (await ghApi(`repos/${currentOwner}/${repo}/git/blobs`, 'POST', { content: item.content, encoding: 'utf-8' }, signal)).sha;
                } else {
                    const base64Data = await blobToBase64(item.blobData);
                    blobSha = (await ghApi(`repos/${currentOwner}/${repo}/git/blobs`, 'POST', { content: base64Data, encoding: 'base64' }, signal)).sha;
                }
                treeEntries.push({ path: fullPath, mode: "100644", type: "blob", sha: blobSha });

                processedCount++;
                setUpdate(`Processing (${processedCount}/${filesToUpload.length})...`, 10 + (80 * (processedCount / filesToUpload.length)));
            })();

            activePromises.push(uploadTask);
            if (activePromises.length >= concurrencyLimit) {
                await Promise.race(activePromises);
                activePromises = activePromises.filter(p => {
                    let isPending = false;
                    Promise.race([p, Promise.resolve("resolved")]).then(v => { if(v !== "resolved") isPending = true; });
                    return isPending;
                });
            }
        }
        await Promise.all(activePromises);
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        setUpdate("Building Git Tree...", 92);
        const newTree = await ghApi(`repos/${currentOwner}/${repo}/git/trees`, 'POST', { base_tree: baseTreeSha, tree: treeEntries }, signal);

        setUpdate("Creating Commit...", 95);
        const newCommit = await ghApi(`repos/${currentOwner}/${repo}/git/commits`, 'POST', { message: commitMsg, tree: newTree.sha, parents: [latestCommitSha] }, signal);

        setUpdate("Pushing to GitHub...", 98);
        if (isNewBranch) await ghApi(`repos/${currentOwner}/${repo}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: newCommit.sha }, signal);
        else await ghApi(`repos/${currentOwner}/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha: newCommit.sha, force: false }, signal);

        setUpdate("Done!", 100);
        showAlert(`Success! ${filesToUpload.length} files uploaded to <strong class="text-white">${repo}:${branch}</strong>.`, 'success');

        setTimeout(() => { 
            DOM.progressContainer.classList.add('hidden'); 
            DOM.fileSection.classList.add('hidden'); 
            selectedFiles = []; strippedFiles = []; 
        }, 3500);

    } catch (error) { 
        if (error.name !== "AbortError") showAlert(`Failed: ${error.message}`); 
        DOM.progressContainer.classList.add('hidden'); 
    } finally {
        isUploading = false;
        DOM.btnCancelUpload.classList.add('hidden');
        DOM.btnUpload.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> <span class="relative z-10">Upload to GitHub</span>`;
        DOM.btnUpload.disabled = false;
    }
}

async function executeCreateBranch() {
    const repo = DOM.repo.value.trim();
    const sourceBranch = DOM.lblSourceBranch.textContent;
    let newBranch = DOM.newBranchName.value.trim();

    if (!newBranch) return showAlert("Branch name cannot be empty");
    newBranch = sanitizeFileName(newBranch).toLowerCase(); 

    const btnHtml = DOM.btnConfirmBranch.innerHTML;
    DOM.btnConfirmBranch.innerHTML = `<div class="spinner-cyber !w-4 !h-4"></div>`;
    DOM.btnConfirmBranch.disabled = true;

    try {
        const latestCommitSha = (await ghApi(`repos/${currentOwner}/${repo}/git/ref/heads/${sourceBranch}`)).object.sha;
        await ghApi(`repos/${currentOwner}/${repo}/git/refs`, 'POST', {
            ref: `refs/heads/${newBranch}`,
            sha: latestCommitSha
        });

        showAlert(`Branch <b>${escapeHtml(newBranch)}</b> created successfully.`, 'success');
        DOM.branch.value = newBranch;
        if (!repoBranchesCache.includes(newBranch)) repoBranchesCache.push(newBranch);
        saveSettings();
        closeModal('modal-branch', 'modal-branch-content');
        fetchRepositoryTree();
    } catch (err) {
        showAlert(`Failed to create branch: ${err.message}`);
    } finally {
        DOM.btnConfirmBranch.innerHTML = btnHtml;
        DOM.btnConfirmBranch.disabled = false;
    }
}

async function fetchRepositoryTree() {
    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    if (!currentOwner || !repo || !branch) return showAlert("Owner, Repo, and Branch are required to fetch files.");

    hideAlert();
    DOM.treeLoading.classList.remove('hidden');
    DOM.btnFetchTree.disabled = true;
    resetEditor();

    try {
        DOM.lblActiveRepo.textContent = `${currentOwner}/${repo} [${branch}]`;
        const data = await ghApi(`repos/${currentOwner}/${repo}/git/trees/${branch}?recursive=1`);

        if (data.truncated) {
            showAlert("Warning: Repository is very large. Some folders may be lazy-loaded when clicked.", "error");
        }

        const treeMap = {};
        const root = [];

        data.tree.forEach(item => {
            item.children = [];
            treeMap[item.path] = item;
            const parts = item.path.split('/');
            if (parts.length === 1) {
                root.push(item);
            } else {
                parts.pop();
                const parentPath = parts.join('/');
                if (treeMap[parentPath]) {
                    treeMap[parentPath].children.push(item);
                } else {
                    root.push(item);
                }
            }
        });

        currentTreeData = data.tree;
        DOM.repoTreeView.innerHTML = '';
        renderTreeLevel(root, DOM.repoTreeView, 0, data.truncated);

    } catch (error) {
        showAlert(`Failed to fetch tree: ${error.message}`);
        DOM.repoTreeView.innerHTML = '<div class="text-rose-500 text-center mt-10">Failed to load repository files.</div>';
    } finally {
        DOM.treeLoading.classList.add('hidden');
        DOM.btnFetchTree.disabled = false;
    }
}

function renderTreeLevel(nodes, container, depth, isTruncated) {
    nodes.sort((a, b) => {
        if (a.type === b.type) return a.path.split('/').pop().localeCompare(b.path.split('/').pop());
        return a.type === 'tree' ? -1 : 1;
    });

    nodes.forEach(item => {
        const name = item.path.split('/').pop();
        const div = document.createElement('div');

        const header = document.createElement('div');
        header.className = `tree-item p-1.5 rounded my-0.5 truncate`;
        header.title = item.path;
        header.setAttribute('draggable', 'true'); // Make item draggable

        // Drag and Drop Listeners
        header.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify(item));
            e.dataTransfer.effectAllowed = "move";
        });

        if (item.type === 'tree') {
            header.innerHTML = `<i class="fas fa-folder text-amber-500 mr-2 w-4 text-center"></i> <span class="truncate font-bold">${escapeHtml(name)}</span>`;

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children hidden';

            // Folder specific drag events
            header.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                header.classList.add('drag-over');
            });
            header.addEventListener('dragleave', () => {
                header.classList.remove('drag-over');
            });
            header.addEventListener('drop', (e) => {
                e.preventDefault();
                header.classList.remove('drag-over');
                try {
                    const draggedItem = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (draggedItem.path !== item.path && !item.path.startsWith(draggedItem.path)) {
                        const newPath = item.path + '/' + draggedItem.path.split('/').pop();
                        executeMoveItem(newPath, draggedItem);
                    }
                } catch(err) { console.error("Drag data error", err); }
            });

            header.addEventListener('click', async (e) => {
                e.stopPropagation();
                setActiveTreeSelection(item, header);

                if (isTruncated && item.children.length === 0 && childrenContainer.innerHTML === '') {
                    const icon = header.querySelector('i');
                    icon.className = 'fas fa-spinner fa-spin text-amber-500 mr-2 w-4 text-center';
                    try {
                        const repo = DOM.repo.value.trim();
                        const subTree = await ghApi(`repos/${currentOwner}/${repo}/git/trees/${item.sha}`);
                        subTree.tree.forEach(subItem => {
                            subItem.path = `${item.path}/${subItem.path}`;
                            subItem.children = [];
                            item.children.push(subItem);
                        });
                        renderTreeLevel(item.children, childrenContainer, depth + 1, false);
                        childrenContainer.classList.remove('hidden');
                    } catch(e) {
                        showAlert("Failed to fetch folder contents.");
                    }
                    icon.className = 'fas fa-folder-open text-amber-400 mr-2 w-4 text-center';
                } else {
                    const isHidden = childrenContainer.classList.toggle('hidden');
                    const icon = header.querySelector('i');
                    icon.className = isHidden ? 'fas fa-folder text-amber-500 mr-2 w-4 text-center' : 'fas fa-folder-open text-amber-400 mr-2 w-4 text-center';
                    if (!isHidden && childrenContainer.innerHTML === '') renderTreeLevel(item.children, childrenContainer, depth + 1, isTruncated);
                }
            });

            div.appendChild(header);
            div.appendChild(childrenContainer);

        } else if (item.type === 'blob') {
            header.innerHTML = `<i class="far fa-file-code text-blue-400 mr-2 w-4 text-center"></i> <span class="truncate">${escapeHtml(name)}</span>`;
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                setActiveTreeSelection(item, header);
                loadFileContent(item.path, item.sha, header);
            });
            div.appendChild(header);
        }

        container.appendChild(div);
    });
}

function setActiveTreeSelection(item, element) {
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'));
    if(element) element.classList.add('selected');
    activeTreeSelection = item;

    DOM.btnTreeDownload.classList.remove('hidden');
    DOM.btnTreeDelete.classList.remove('hidden');
    DOM.btnTreeMove.classList.remove('hidden');
}

async function loadFileContent(path, sha, element) {
    const imgExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.bmp'];
    const binaryExts = ['.pdf', '.exe', '.dll', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.wav'];
    const lowerPath = path.toLowerCase();

    const isImage = imgExtensions.some(ext => lowerPath.endsWith(ext));
    const isBinary = binaryExts.some(ext => lowerPath.endsWith(ext));

    if(isBinary && !isImage) {
        showAlert(`Cannot view binary file: <b>${escapeHtml(path.split('/').pop())}</b>. Use Download button instead.`, "error");
        return;
    }

    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    DOM.editorFilePath.textContent = path;
    DOM.editorLoading.classList.remove('hidden');
    DOM.editorLoadingText.textContent = "Loading file data...";
    if(aceEditor) aceEditor.setReadOnly(true);

    DOM.btnSearchFile.classList.add('hidden');
    DOM.btnSaveFile.classList.add('hidden');
    DOM.commitMsgContainer.style.display = 'none';
    DOM.fileEditor.style.opacity = '0';
    DOM.fileEditor.style.pointerEvents = 'none';
    DOM.imagePreviewContainer.classList.add('hidden');
    DOM.editorPlaceholder.style.display = 'none';

    try {
        const data = await ghApi(`repos/${currentOwner}/${repo}/contents/${path}?ref=${branch}`);

        if (isImage) {
            // Image Preview Mode
            const ext = path.split('.').pop().toLowerCase();
            DOM.imagePreviewImg.src = `data:image/${ext};base64,${data.content}`;
            DOM.imagePreviewContainer.classList.remove('hidden');
            DOM.imagePreviewContainer.classList.add('flex');
            editingFilePath = path;
            editingFileSha = data.sha;
        } else {
            // Text Editor Mode
            const content = decodeURIComponent(escape(atob(data.content)));
            const modelist = ace.require("ace/ext/modelist");
            const mode = modelist.getModeForPath(path).mode;
            aceEditor.session.setMode(mode);

            DOM.fileEditor.style.opacity = '1';
            DOM.fileEditor.style.pointerEvents = 'auto';

            aceEditor.setValue(content, -1);
            originalFileContent = content;
            editingFilePath = path;
            editingFileSha = data.sha; 

            aceEditor.setReadOnly(false);
            DOM.btnSearchFile.classList.remove('hidden');
            DOM.btnSaveFile.classList.remove('hidden');
            DOM.btnSaveFile.classList.add('opacity-50');
            DOM.btnSaveFile.disabled = true;
            DOM.btnSaveFile.classList.remove('btn-action', 'btn-blue');

            DOM.commitMsgContainer.style.display = 'flex';
            DOM.editCommitMsg.value = `Update ${path.split('/').pop()}`;
        }

    } catch (error) {
        showAlert(`Failed to load file: ${error.message}`);
        resetEditor();
    } finally {
        DOM.editorLoading.classList.add('hidden');
    }
}

async function saveEditedFile() {
    if (!editingFilePath || DOM.imagePreviewContainer.classList.contains('flex')) return; // Can't save images from editor

    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    const content = aceEditor.getValue();
    const msg = DOM.editCommitMsg.value.trim() || `Update ${editingFilePath.split('/').pop()}`;

    const btnHtml = DOM.btnSaveFile.innerHTML;
    DOM.btnSaveFile.innerHTML = `<div class="spinner-cyber !w-3 !h-3 inline-block"></div>`;
    DOM.btnSaveFile.disabled = true;
    if(aceEditor) aceEditor.setReadOnly(true);

    try {
        const base64Content = btoa(unescape(encodeURIComponent(content)));
        const body = { message: msg, content: base64Content, branch: branch };
        if (editingFileSha) body.sha = editingFileSha;

        const response = await ghApi(`repos/${currentOwner}/${repo}/contents/${editingFilePath}`, 'PUT', body);

        originalFileContent = content; 
        editingFileSha = response.content.sha; 

        showAlert(`File <strong class="text-white">${escapeHtml(editingFilePath)}</strong> saved successfully.`, 'success');
        DOM.btnSaveFile.innerHTML = `<i class="fas fa-check"></i> <span>Saved</span>`;

        if(!editingFileSha) fetchRepositoryTree();

        setTimeout(() => {
            DOM.btnSaveFile.innerHTML = `<i class="fas fa-save"></i> <span>Save</span>`;
            DOM.btnSaveFile.classList.remove('btn-action', 'btn-blue');
            DOM.btnSaveFile.classList.add('opacity-50');
        }, 2000);

    } catch (error) {
        showAlert(`Failed to save file: ${error.message}`);
        DOM.btnSaveFile.innerHTML = btnHtml;
        DOM.btnSaveFile.disabled = false;
    } finally {
        if(aceEditor) aceEditor.setReadOnly(false);
    }
}

function resetEditor() {
    editingFilePath = null;
    editingFileSha = null;
    originalFileContent = "";
    DOM.editorFilePath.textContent = "No file selected";

    if(aceEditor) {
        aceEditor.setValue("", -1);
        aceEditor.setReadOnly(true);
    }
    DOM.editorPlaceholder.style.display = 'flex';
    DOM.fileEditor.style.opacity = '0';
    DOM.fileEditor.style.pointerEvents = 'none';
    DOM.imagePreviewContainer.classList.add('hidden');
    DOM.imagePreviewContainer.classList.remove('flex');

    DOM.btnSearchFile.classList.add('hidden');
    DOM.btnSaveFile.classList.add('hidden');
    DOM.commitMsgContainer.style.display = 'none';
}

async function downloadEntireRepo() {
    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    if (!currentOwner || !repo || !branch) return showAlert("Please load a repository first.");

    DOM.editorLoading.classList.remove('hidden');
    DOM.editorLoadingText.textContent = "Requesting Repo ZIP...";
    const token = DOM.token.value.trim();

    try {
        const response = await fetch(`https://api.github.com/repos/${currentOwner}/${repo}/zipball/${branch}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status} - Cannot download ZIP`);

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${repo}-${branch}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showAlert(`Successfully downloaded repository as ZIP.`, "success");
    } catch(err) {
        showAlert(`Failed to download repo: ${err.message}`);
    } finally {
        DOM.editorLoading.classList.add('hidden');
    }
}

async function downloadActiveTreeSelection() {
    if (!activeTreeSelection) return showAlert("Please select a file or folder from the tree first.");
    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    const item = activeTreeSelection;

    DOM.editorLoading.classList.remove('hidden');
    DOM.editorLoadingText.textContent = item.type === 'blob' ? "Downloading file..." : "Zipping folder...";

    try {
        if (item.type === 'blob') {
            const data = await ghApi(`repos/${currentOwner}/${repo}/contents/${item.path}?ref=${branch}`);
            const binaryString = atob(data.content);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }

            const blob = new Blob([bytes], { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = item.path.split('/').pop();
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else if (item.type === 'tree') {
            const zip = new JSZip();
            const folderPrefix = item.path.endsWith('/') ? item.path : item.path + '/';

            const filesToZip = currentTreeData.filter(node => node.type === 'blob' && node.path.startsWith(folderPrefix));
            if (filesToZip.length === 0) throw new Error("Folder is empty.");

            let fetchedCount = 0;
            for (let fileNode of filesToZip) {
                DOM.editorLoadingText.textContent = `Fetching (${++fetchedCount}/${filesToZip.length})...`;
                const resData = await ghApi(`repos/${currentOwner}/${repo}/contents/${fileNode.path}?ref=${branch}`);
                const binStr = atob(resData.content);
                const len = binStr.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) { bytes[i] = binStr.charCodeAt(i); }

                const relativePath = fileNode.path.substring(folderPrefix.length);
                zip.file(relativePath, bytes);
            }

            DOM.editorLoadingText.textContent = "Generating ZIP archive...";
            const content = await zip.generateAsync({ type: "blob" });
            const url = window.URL.createObjectURL(content);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${item.path.split('/').pop()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
        showAlert(`Successfully downloaded <b>${escapeHtml(item.path.split('/').pop())}</b>`, "success");
    } catch (err) {
        showAlert(`Download failed: ${err.message}`);
    } finally {
        DOM.editorLoading.classList.add('hidden');
    }
}

// --- Move/Rename Logic ---
function promptMoveSelection() {
    if (!activeTreeSelection) return showAlert("Please select a file or folder from the tree first.");
    DOM.moveItemPath.value = activeTreeSelection.path;
    openModal('modal-move', 'modal-move-content');
}

async function executeMoveItem(newPathTarget, targetItemNode) {
    const oldPath = targetItemNode.path;
    const newPath = newPathTarget;

    if(!newPath || oldPath === newPath) return closeModal('modal-move', 'modal-move-content');

    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    const msg = `Move ${oldPath} to ${newPath}`;

    DOM.editorLoading.classList.remove('hidden');
    DOM.editorLoadingText.textContent = "Moving item...";

    const btnHtml = DOM.btnConfirmMove.innerHTML;
    DOM.btnConfirmMove.innerHTML = `<div class="spinner-cyber !w-4 !h-4"></div>`;
    DOM.btnConfirmMove.disabled = true;

    try {
        const latestCommitSha = (await ghApi(`repos/${currentOwner}/${repo}/git/ref/heads/${branch}`)).object.sha;
        const baseTreeSha = (await ghApi(`repos/${currentOwner}/${repo}/git/commits/${latestCommitSha}`)).tree.sha;

        let treeEntries = [];

        if (targetItemNode.type === 'blob') {
            treeEntries.push({ path: newPath, mode: "100644", type: "blob", sha: targetItemNode.sha });
            treeEntries.push({ path: oldPath, mode: "100644", type: "blob", sha: null }); 
        } else if (targetItemNode.type === 'tree') {
            const folderPrefix = oldPath.endsWith('/') ? oldPath : oldPath + '/';
            const targetPrefix = newPath.endsWith('/') ? newPath : newPath + '/';

            const filesToMove = currentTreeData.filter(node => node.type === 'blob' && node.path.startsWith(folderPrefix));

            filesToMove.forEach(file => {
                const relPath = file.path.substring(folderPrefix.length);
                treeEntries.push({ path: targetPrefix + relPath, mode: "100644", type: "blob", sha: file.sha });
                treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null }); 
            });
        }

        const newTree = await ghApi(`repos/${currentOwner}/${repo}/git/trees`, 'POST', { base_tree: baseTreeSha, tree: treeEntries });
        const newCommit = await ghApi(`repos/${currentOwner}/${repo}/git/commits`, 'POST', { message: msg, tree: newTree.sha, parents: [latestCommitSha] });
        await ghApi(`repos/${currentOwner}/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha: newCommit.sha, force: false });

        closeModal('modal-move', 'modal-move-content');
        showAlert(`Successfully moved to <b>${escapeHtml(newPath)}</b>`, "success");

        fetchRepositoryTree();
        if (editingFilePath === oldPath) resetEditor();

    } catch (err) {
        showAlert(`Move failed: ${err.message}`);
    } finally {
        DOM.btnConfirmMove.innerHTML = btnHtml;
        DOM.btnConfirmMove.disabled = false;
        DOM.editorLoading.classList.add('hidden');
    }
}

async function executeSmartOrganize() {
    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    if (!currentOwner || !repo || !branch) return showAlert("Please load a repository first.");

    const filesToMove = [];
    const imgExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];

    currentTreeData.forEach(node => {
        if (node.type === 'blob' && !node.path.includes('/')) {
            const ext = node.path.split('.').pop().toLowerCase();
            if (imgExtensions.includes(ext)) {
                filesToMove.push({ oldPath: node.path, newPath: `images/${sanitizeFileName(node.path)}`, sha: node.sha });
            } else if (ext === 'enc') {
                filesToMove.push({ oldPath: node.path, newPath: `data/${sanitizeFileName(node.path)}`, sha: node.sha });
            }
        }
    });

    if (filesToMove.length === 0) {
        return showAlert("Semua file sudah rapi! Tidak ditemukan gambar atau file .enc yang tercecer di folder utama.", "success");
    }

    if (!confirm(`Ditemukan ${filesToMove.length} file yang berantakan. Pindahkan semua secara otomatis ke folder images/ dan data/?`)) return;

    DOM.treeLoading.classList.remove('hidden');

    try {
        const latestCommitSha = (await ghApi(`repos/${currentOwner}/${repo}/git/ref/heads/${branch}`)).object.sha;
        const baseTreeSha = (await ghApi(`repos/${currentOwner}/${repo}/git/commits/${latestCommitSha}`)).tree.sha;

        let treeEntries = [];
        filesToMove.forEach(f => {
            treeEntries.push({ path: f.newPath, mode: "100644", type: "blob", sha: f.sha });
            treeEntries.push({ path: f.oldPath, mode: "100644", type: "blob", sha: null }); 
        });

        const newTree = await ghApi(`repos/${currentOwner}/${repo}/git/trees`, 'POST', { base_tree: baseTreeSha, tree: treeEntries });
        const newCommit = await ghApi(`repos/${currentOwner}/${repo}/git/commits`, 'POST', { message: `Smart Organize: Auto-moved ${filesToMove.length} files`, tree: newTree.sha, parents: [latestCommitSha] });
        await ghApi(`repos/${currentOwner}/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha: newCommit.sha, force: false });

        showAlert(`Berhasil merapikan ${filesToMove.length} file sekaligus!`, "success");
        fetchRepositoryTree();
    } catch (err) {
        showAlert(`Gagal merapikan: ${err.message}`);
    } finally {
        DOM.treeLoading.classList.add('hidden');
    }
}

function promptDeleteAll() {
    const repo = DOM.repo.value.trim();
    if (!currentOwner || !repo) return showAlert("Please select and load a repository first.");
    DOM.delAllCommitMsg.value = "Delete all files except README.md";
    openModal('modal-delete-all', 'modal-delete-all-content');
}

async function executeDeleteAll() {
    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    const msg = DOM.delAllCommitMsg.value.trim() || `Delete all files except README.md`;

    const btnHtml = DOM.btnConfirmDelAll.innerHTML;
    DOM.btnConfirmDelAll.innerHTML = `<div class="spinner-cyber !w-4 !h-4"></div>`;
    DOM.btnConfirmDelAll.disabled = true;

    try {
        // Find all blobs except readme.md
        const filesToDelete = currentTreeData.filter(n => n.type === 'blob' && n.path.toLowerCase() !== 'readme.md');
        if (filesToDelete.length === 0) {
            closeModal('modal-delete-all', 'modal-delete-all-content');
            return showAlert("No files to delete (Only README.md exists, or repo is already empty).", "success");
        }

        // Proper way to delete files via base_tree is passing sha: null
        const treeEntries = filesToDelete.map(n => ({ path: n.path, mode: "100644", type: "blob", sha: null }));

        const latestCommitSha = (await ghApi(`repos/${currentOwner}/${repo}/git/ref/heads/${branch}`)).object.sha;
        const baseTreeSha = (await ghApi(`repos/${currentOwner}/${repo}/git/commits/${latestCommitSha}`)).tree.sha;

        const newTree = await ghApi(`repos/${currentOwner}/${repo}/git/trees`, 'POST', { base_tree: baseTreeSha, tree: treeEntries });
        const newCommit = await ghApi(`repos/${currentOwner}/${repo}/git/commits`, 'POST', { message: msg, tree: newTree.sha, parents: [latestCommitSha] });
        await ghApi(`repos/${currentOwner}/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha: newCommit.sha, force: false });

        closeModal('modal-delete-all', 'modal-delete-all-content');
        showAlert(`Successfully deleted ${filesToDelete.length} files (README.md protected).`, "success");

        fetchRepositoryTree();
        resetEditor();
    } catch (err) {
        showAlert(`Delete All failed: ${err.message}`);
        closeModal('modal-delete-all', 'modal-delete-all-content');
    } finally {
        DOM.btnConfirmDelAll.innerHTML = btnHtml;
        DOM.btnConfirmDelAll.disabled = false;
    }
}

function promptDeleteActiveSelection() {
    if (!activeTreeSelection) return showAlert("Please select a file or folder from the tree first.");

    // Prevent deleting README directly
    if (activeTreeSelection.path.toLowerCase() === 'readme.md') {
        return showAlert("README.md cannot be deleted to prevent fatal empty repository errors.", "error");
    }

    DOM.modalFileTarget.textContent = activeTreeSelection.path;
    DOM.delFileCommitMsg.value = `Delete ${activeTreeSelection.path}`;
    openModal('modal-delete-file', 'modal-delete-file-content');
}

async function executeDeleteSelection() {
    if (!activeTreeSelection) return;
    const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
    const item = activeTreeSelection;
    const msg = DOM.delFileCommitMsg.value.trim() || `Delete ${item.path}`;

    const btnHtml = DOM.btnConfirmDelFile.innerHTML;
    DOM.btnConfirmDelFile.innerHTML = `<div class="spinner-cyber !w-4 !h-4"></div>`;
    DOM.btnConfirmDelFile.disabled = true;

    try {
        const latestCommitSha = (await ghApi(`repos/${currentOwner}/${repo}/git/ref/heads/${branch}`)).object.sha;
        const baseTreeSha = (await ghApi(`repos/${currentOwner}/${repo}/git/commits/${latestCommitSha}`)).tree.sha;
        let treeEntries = [];

        if (item.type === 'blob') {
            // Safe delete blob via tree API by passing sha null
            treeEntries.push({ path: item.path, mode: "100644", type: "blob", sha: null });
        } else if (item.type === 'tree') {
            // Collect ALL files inside folder and push them with sha null to delete everything
            const folderPrefix = item.path.endsWith('/') ? item.path : item.path + '/';
            const filesToDelete = currentTreeData.filter(node => node.type === 'blob' && node.path.startsWith(folderPrefix));
            treeEntries = filesToDelete.map(n => ({ path: n.path, mode: "100644", type: "blob", sha: null }));
        }

        const newTree = await ghApi(`repos/${currentOwner}/${repo}/git/trees`, 'POST', { base_tree: baseTreeSha, tree: treeEntries });
        const newCommit = await ghApi(`repos/${currentOwner}/${repo}/git/commits`, 'POST', { message: msg, tree: newTree.sha, parents: [latestCommitSha] });
        await ghApi(`repos/${currentOwner}/${repo}/git/refs/heads/${branch}`, 'PATCH', { sha: newCommit.sha, force: false });

        closeModal('modal-delete-file', 'modal-delete-file-content');
        showAlert(`Successfully deleted <b>${escapeHtml(item.path)}</b> and all its contents.`, "success");

        activeTreeSelection = null;
        DOM.btnTreeDownload.classList.add('hidden');
        DOM.btnTreeDelete.classList.add('hidden');
        DOM.btnTreeMove.classList.add('hidden');

        fetchRepositoryTree();
        resetEditor();
    } catch (err) {
        showAlert(`Delete failed: ${err.message}`);
        closeModal('modal-delete-file', 'modal-delete-file-content');
    } finally {
        DOM.btnConfirmDelFile.innerHTML = btnHtml;
        DOM.btnConfirmDelFile.disabled = false;
    }
}

function openModal(modalId, contentId) {
    document.getElementById(modalId).classList.add('active');
    document.getElementById(contentId).classList.replace('scale-95', 'scale-100');
}
function closeModal(modalId, contentId) {
    document.getElementById(contentId).classList.replace('scale-100', 'scale-95');
    setTimeout(() => document.getElementById(modalId).classList.remove('active'), 200);
}

function promptCreateItem(type) {
    const repo = DOM.repo.value.trim();
    if (!currentOwner || !repo) return showAlert("Owner and Repo are required to create items.");
    pendingCreateType = type;
    DOM.modalCreateTitle.innerHTML = type === 'file' ? `<i class="fas fa-file-medical text-blue-500 mr-2"></i>Create New File` : `<i class="fas fa-folder-plus text-blue-500 mr-2"></i>Create New Folder`;
    DOM.createItemPath.value = activeTreeSelection && activeTreeSelection.type === 'tree' ? activeTreeSelection.path + '/' : '';
    DOM.createItemPath.placeholder = type === 'file' ? 'src/components/button.js' : 'src/new-folder';
    openModal('modal-create', 'modal-create-content');
}

async function executeCreateItem() {
    let path = DOM.createItemPath.value.trim();
    if (!path) return;
    closeModal('modal-create', 'modal-create-content');

    if (pendingCreateType === 'folder') {
        path = path.replace(/\/$/, '') + '/.gitkeep';
        DOM.editorLoading.classList.remove('hidden');
        DOM.editorLoadingText.textContent = "Creating folder structure...";

        try {
            const repo = DOM.repo.value.trim(), branch = DOM.branch.value.trim();
            const body = { message: `Create folder ${path.split('/')[0]}`, content: btoa(""), branch: branch };
            await ghApi(`repos/${currentOwner}/${repo}/contents/${path}`, 'PUT', body);
            showAlert(`Folder created successfully.`, 'success');
            fetchRepositoryTree();
        } catch(e) {
            showAlert(`Failed to create folder: ${e.message}`);
        } finally {
            DOM.editorLoading.classList.add('hidden');
        }
    } else {
        resetEditor();
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('selected'));
        DOM.editorFilePath.textContent = path;
        editingFilePath = path;
        editingFileSha = null; 
        originalFileContent = "";

        const modelist = ace.require("ace/ext/modelist");
        const mode = modelist.getModeForPath(path).mode;
        if(aceEditor) {
            aceEditor.session.setMode(mode);
            DOM.editorPlaceholder.style.display = 'none';
            DOM.fileEditor.style.opacity = '1';
            DOM.fileEditor.style.pointerEvents = 'auto';
            aceEditor.setValue("", -1);
            aceEditor.setReadOnly(false);
        }

        DOM.btnSearchFile.classList.remove('hidden');
        DOM.btnSaveFile.classList.remove('hidden');
        DOM.btnSaveFile.classList.remove('opacity-50');
        DOM.btnSaveFile.classList.add('btn-action', 'btn-blue');
        DOM.btnSaveFile.disabled = false;

        DOM.commitMsgContainer.style.display = 'flex';
        DOM.editCommitMsg.value = `Create ${path.split('/').pop()}`;
    }
}

async function createRepository() {
    const name = DOM.newRepoName.value.trim();
    if (!name) return showAlert("Repository name cannot be empty!");
    if (!currentOwner) return showAlert("Please Load Account first.");

    const desc = DOM.newRepoDesc.value.trim();
    const isPrivate = document.querySelector('input[name="repo_privacy"]:checked').value === 'private';
    const autoInit = DOM.newRepoInit.checked;

    hideAlert();
    const btnHtml = DOM.btnCreateRepo.innerHTML;
    DOM.btnCreateRepo.innerHTML = `<div class="spinner-cyber !w-4 !h-4 mx-auto"></div>`;
    DOM.btnCreateRepo.disabled = true;

    try {
        await ghApi('user/repos', 'POST', { name, description: desc, private: isPrivate, auto_init: autoInit });
        showAlert(`Repository <strong class="text-white">${escapeHtml(name)}</strong> successfully created!`, 'success');
        DOM.newRepoName.value = '';
        DOM.newRepoDesc.value = '';

        if (!userReposCache.includes(name)) userReposCache.unshift(name);
        saveSettings();

        DOM.repo.value = name;
        DOM.branch.value = 'main';

    } catch (error) {
        let msg = error.message;
        if(msg.includes('403') || msg.toLowerCase().includes('resource not accessible')) {
            msg = "Token missing 'repo' scope. Please create/check 'repo' scope on your token.";
        }
        showAlert(`Failed to create repo: ${msg}`);
    } finally {
        DOM.btnCreateRepo.innerHTML = btnHtml;
        DOM.btnCreateRepo.disabled = false;
    }
}

async function executeDeleteRepository() {
    const repo = DOM.delRepoName.value.trim();
    if(!repo || !currentOwner) return;

    const btnHtml = DOM.btnConfirmDel.innerHTML;
    DOM.btnConfirmDel.innerHTML = `<div class="spinner-cyber !w-4 !h-4 mx-auto"></div>`;
    DOM.btnConfirmDel.disabled = true;
    DOM.btnCancelDel.disabled = true;

    try {
        await ghApi(`repos/${currentOwner}/${repo}`, 'DELETE');
        closeModal('modal-delete', 'modal-delete-content');
        showAlert(`Repository <strong class="text-white">${escapeHtml(repo)}</strong> successfully deleted permanently.`, 'success');
        DOM.delRepoName.value = '';
        DOM.btnTriggerDelete.disabled = true;

        userReposCache = userReposCache.filter(r => r !== repo);
        saveSettings();
        if (DOM.repo.value === repo) DOM.repo.value = '';
    } catch (error) {
        closeModal('modal-delete', 'modal-delete-content');
        let msg = error.message;
        if(msg.includes('403') || msg.toLowerCase().includes('resource not accessible')) {
            msg = "Token missing 'delete_repo' scope. Please check this permission when creating the token.";
        }
        showAlert(`Failed to delete repo: ${msg}`);
    } finally {
        DOM.btnConfirmDel.innerHTML = btnHtml;
        DOM.btnConfirmDel.disabled = false;
    }
}

window.addEventListener('DOMContentLoaded', init);
