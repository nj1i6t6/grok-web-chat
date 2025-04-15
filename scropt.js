document.addEventListener('DOMContentLoaded', () => {
    // --- 配置區域 ---
    // 移除硬編碼 API Key
    const API_URL_CHAT = 'https://api.x.ai/v1/chat/completions';
    const API_URL_MODELS = 'https://api.x.ai/v1/models'; // 用於測試連線
    let currentModel = 'grok-3-mini-beta';
    let apiKey = null; // 用於儲存驗證後的 API Key

    // --- DOM 元素獲取 ---
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const modelSelector = document.getElementById('model-selector');
    const exportButton = document.getElementById('export-button');
    const importButton = document.getElementById('import-button');
    const importFileInput = document.getElementById('import-file-input');
    const clearButton = document.getElementById('clear-button');
    const themeToggleButton = document.getElementById('theme-toggle-button');
    const body = document.body;
    const sidebar = document.getElementById('sidebar');
    const menuToggleButton = document.getElementById('menu-toggle-button');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const closeSidebarButton = document.getElementById('close-sidebar-button');
    // API Key 相關元素
    const apiKeyInput = document.getElementById('api-key-input');
    const connectApiButton = document.getElementById('connect-api-button');
    const apiStatus = document.getElementById('api-status');
    const clearApiKeyButton = document.getElementById('clear-api-key-button');


    // --- 狀態變數 ---
    let chatHistory = []; // [{ role, content, id }, ...]
    let isLoading = false;
    let messageIdCounter = 0;
    let currentEditingMessageId = null; // 追蹤正在編輯的訊息 ID

    // --- 初始化 ---
    function initializeChat() {
        if (!checkElements()) {
             console.error("Initialization failed: One or more DOM elements not found.");
             // 在頁面上顯示一個更友好的提示，而不是僅依賴 console
             const initialMsg = document.querySelector('#chat-messages .system-message');
             if (initialMsg) initialMsg.textContent = "頁面元素加載錯誤，請檢查 HTML ID 是否正確。";
             return;
        }
        loadTheme();
        setupModelSelector();
        loadAndVerifyApiKey(); // 加載並嘗試驗證儲存的 Key
        adjustTextareaHeight();
        setupEventListeners();
        console.log("Chat initialized successfully."); // 保留 console 確認初始化
    }

    function checkElements() {
        // 增加 API Key 相關元素檢查
        const elementsToCheck = [chatMessages, userInput, sendButton, modelSelector, exportButton, importButton, importFileInput, clearButton, themeToggleButton, body, sidebar, menuToggleButton, sidebarOverlay, closeSidebarButton, apiKeyInput, connectApiButton, apiStatus, clearApiKeyButton];
        const missingElements = elementsToCheck.filter(el => !el);
        if (missingElements.length > 0) {
            console.error("Missing DOM elements:", missingElements);
            return false;
        }
        return true;
    }

    // --- API 金鑰處理 ---
    async function loadAndVerifyApiKey() {
        const storedKey = localStorage.getItem('grokApiKey');
        if (storedKey) {
            console.log("Found stored API key. Verifying...");
            setApiStatus("正在驗證儲存的金鑰...", "testing");
            const isValid = await testApiKey(storedKey);
            if (isValid) {
                apiKey = storedKey;
                apiKeyInput.value = '********'; // 不直接顯示 key
                apiKeyInput.type = 'password';
                setApiStatus("金鑰有效，已連線", "success");
                enableChat();
                clearApiKeyButton.style.display = 'block';
            } else {
                setApiStatus("儲存的金鑰無效或已過期，請重新輸入", "error");
                localStorage.removeItem('grokApiKey');
                apiKeyInput.value = ''; // 清空輸入框
                 apiKeyInput.type = 'text';
                disableChat();
                clearApiKeyButton.style.display = 'none';
            }
        } else {
            setApiStatus("請輸入金鑰並連線", "");
            disableChat();
            clearApiKeyButton.style.display = 'none';
        }
    }

    async function handleConnectApiKey() {
        const inputKey = apiKeyInput.value.trim();
        if (!inputKey) {
            setApiStatus("請輸入 API 金鑰", "error");
            return;
        }
        setApiStatus("正在測試連線...", "testing");
        connectApiButton.disabled = true;

        const isValid = await testApiKey(inputKey);

        if (isValid) {
            apiKey = inputKey;
            localStorage.setItem('grokApiKey', apiKey);
            setApiStatus("連線成功！", "success");
            enableChat();
            clearApiKeyButton.style.display = 'block';
            apiKeyInput.value = '********'; // 驗證成功後顯示遮蔽符號
            apiKeyInput.type = 'password';
            closeSidebarIfMobile(); // 連線成功後關閉側邊欄（手機）
        } else {
            apiKey = null;
            localStorage.removeItem('grokApiKey');
            // 錯誤訊息已在 testApiKey 中設置
            disableChat();
            clearApiKeyButton.style.display = 'none';
        }
        connectApiButton.disabled = false;
    }

    async function testApiKey(keyToTest) {
        try {
            const response = await fetch(API_URL_MODELS, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${keyToTest}` }
            });
            if (response.ok) {
                console.log("API Key validation successful.");
                return true;
            } else {
                let errorMsg = `連線失敗 (${response.status})`;
                 try { const errorData = await response.json(); errorMsg += `: ${errorData.error || JSON.stringify(errorData)}`; } catch(e) { errorMsg += `: ${response.statusText}`; }
                 setApiStatus(errorMsg, "error"); console.error("API Key validation failed:", errorMsg);
                return false;
            }
        } catch (error) {
             setApiStatus(`網路錯誤或無法連線`, "error"); console.error("Error testing API key:", error); // 簡化錯誤消息
            return false;
        }
    }

    function handleClearApiKey() {
        if (confirm("確定要清除已儲存的 API 金鑰嗎？")) {
            apiKey = null;
            localStorage.removeItem('grokApiKey');
            apiKeyInput.value = '';
            apiKeyInput.type = 'text';
            setApiStatus("金鑰已清除，請重新輸入並連線", "");
            disableChat();
            clearApiKeyButton.style.display = 'none';
            console.log("API Key cleared.");
             closeSidebarIfMobile(); // 操作後關閉側邊欄
        }
    }

    function setApiStatus(message, type = "") { apiStatus.textContent = message; apiStatus.className = `api-status-message status-${type}`; }
    function enableChat() { userInput.disabled = false; sendButton.disabled = false; userInput.classList.remove('chat-disabled'); sendButton.classList.remove('chat-disabled'); userInput.placeholder = "輸入訊息... (Enter 換行)"; }
    function disableChat() { userInput.disabled = true; sendButton.disabled = true; userInput.classList.add('chat-disabled'); sendButton.classList.add('chat-disabled'); userInput.placeholder = "請先連線 API..."; }

    // --- 主題切換 ---
    function toggleTheme() { body.classList.toggle('dark-mode'); const isDarkMode = body.classList.contains('dark-mode'); localStorage.setItem('theme', isDarkMode ? 'dark' : 'light'); const icon = themeToggleButton.querySelector('i'); icon.className = isDarkMode ? 'fas fa-moon' : 'fas fa-sun'; }
    function loadTheme() { const savedTheme = localStorage.getItem('theme'); if (savedTheme === 'dark') { body.classList.add('dark-mode'); themeToggleButton.querySelector('i').className = 'fas fa-moon'; } else { body.classList.remove('dark-mode'); themeToggleButton.querySelector('i').className = 'fas fa-sun'; } }
    // --- 模型選擇 ---
    function setupModelSelector() { const savedModel = localStorage.getItem('selectedModel'); if (savedModel) { const exists = Array.from(modelSelector.options).some(option => option.value === savedModel); if (exists) { modelSelector.value = savedModel; } } currentModel = modelSelector.value; modelSelector.addEventListener('change', () => { currentModel = modelSelector.value; localStorage.setItem('selectedModel', currentModel); displayMessage('system', `模型已切換至: ${currentModel}`, `system-${messageIdCounter++}`); closeSidebarIfMobile(); }); }
    // --- 側邊欄控制 ---
    function openSidebar() { body.classList.add('sidebar-open'); }
    function closeSidebar() { body.classList.remove('sidebar-open'); }
    function toggleSidebar() { body.classList.toggle('sidebar-open'); }
    function closeSidebarIfMobile() { if (window.innerWidth <= 768 && body.classList.contains('sidebar-open')) { closeSidebar(); } }
    // --- 核心功能函數 ---
    function displayMessage(role, content, id, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        if (id) messageDiv.dataset.id = id;
        const contentContainer = document.createElement('div');
        contentContainer.classList.add('message-content');

        switch (role) {
            case 'user': messageDiv.classList.add('user-message'); contentContainer.textContent = content; break;
            case 'assistant': messageDiv.classList.add('assistant-message'); try { const rawHtml = marked.parse(content, { gfm: true, breaks: true }); const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }); contentContainer.innerHTML = cleanHtml; } catch (e) { console.error("Error processing assistant message:", e); contentContainer.textContent = content; messageDiv.style.border = '1px dashed red'; } break;
            case 'system': messageDiv.classList.add('system-message'); if (isError) { messageDiv.classList.add('error-message'); messageDiv.textContent = `錯誤：${content}`; } else { messageDiv.textContent = content; } chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv;
            case 'loading': messageDiv.classList.add('loading-message'); messageDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI 思考中...'; messageDiv.id = id || 'loading-indicator'; chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv;
            default: messageDiv.classList.add('system-message'); messageDiv.textContent = content; chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv;
        }
        messageDiv.appendChild(contentContainer);
        if (id && (role === 'user' || role === 'assistant')) {
            const actionsContainer = document.createElement('div');
            actionsContainer.classList.add('message-actions');
            actionsContainer.innerHTML = `<button class="action-copy" title="複製"><i class="fas fa-copy"></i></button><button class="action-edit" title="編輯"><i class="fas fa-pencil-alt"></i></button><button class="action-delete" title="刪除"><i class="fas fa-trash-alt"></i></button>`;
            messageDiv.appendChild(actionsContainer);
        }
        chatMessages.appendChild(messageDiv); scrollToBottom(); return messageDiv;
    }
    function scrollToBottom() { requestAnimationFrame(() => { chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' }); }); }
    async function callGrokApi() {
        const userText = userInput.value.trim(); if (!userText || isLoading) return;
        if (!apiKey) { displayMessage('system', '請先在側邊欄連線 API 金鑰。', `error-${messageIdCounter++}`, true); openSidebar(); return; }
        isLoading = true; sendButton.disabled = true; userInput.disabled = true;
        const userMessageId = `msg-${messageIdCounter++}`; chatHistory.push({ role: 'user', content: userText, id: userMessageId }); displayMessage('user', userText, userMessageId);
        userInput.value = ''; adjustTextareaHeight(); const loadingId = `loading-${userMessageId}`; const loadingIndicator = displayMessage('loading', '', loadingId );
        try {
            const messagesToSend = chatHistory.map(({ role, content }) => ({ role, content })); const requestBody = { messages: messagesToSend, model: currentModel, stream: false, temperature: 0.7 };
            const response = await fetch(API_URL_CHAT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(requestBody) });
            const currentLoading = document.getElementById(loadingId); if (currentLoading) chatMessages.removeChild(currentLoading);
            if (!response.ok) {
                 let errorText = await response.text(); let errorMessage = `API 請求失敗 (${response.status} ${response.statusText})`;
                 try { const errorJson = JSON.parse(errorText); if (errorJson.error && typeof errorJson.error === 'string') { errorMessage += `: ${errorJson.error}`; } else if (errorJson.error && errorJson.error.message) { errorMessage += `: ${errorJson.error.message}`; } else if (errorJson.detail) { errorMessage += `: ${JSON.stringify(errorJson.detail)}`; } else { errorMessage += `\n原始回應: ${errorText}`; } } catch (e) { errorMessage += `\n原始回應: ${errorText}`; }
                 if (response.status === 401 || response.status === 403) { errorMessage += " 金鑰可能已失效，請嘗試重新連線。"; apiKey = null; localStorage.removeItem('grokApiKey'); disableChat(); setApiStatus("金鑰驗證失敗，請重新連線", "error"); clearApiKeyButton.style.display = 'none'; }
                 console.error('API Error:', errorMessage); displayMessage('system', errorMessage, `error-${messageIdCounter++}`, true);
            } else {
                const data = await response.json();
                if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) { const assistantReply = data.choices[0].message.content.trim(); const assistantMessageId = `msg-${messageIdCounter++}`; chatHistory.push({ role: 'assistant', content: assistantReply, id: assistantMessageId }); displayMessage('assistant', assistantReply, assistantMessageId); }
                else { console.error('Invalid API response structure:', data); displayMessage('system', '收到無效的 API 回應格式。', `error-${messageIdCounter++}`, true); }
            }
        } catch (error) { console.error('Error calling Grok API:', error); const currentLoading = document.getElementById(loadingId); if (currentLoading) chatMessages.removeChild(currentLoading); if (!error.message.includes('API 請求失敗')) { displayMessage('system', `客戶端錯誤: ${error.message}`, `error-${messageIdCounter++}`, true); } }
        finally { isLoading = false; if (apiKey) { sendButton.disabled = false; userInput.disabled = false; userInput.focus(); } }
    }
    // --- 匯出/匯入/清除 功能 ---
    function exportChat() { if (chatHistory.length === 0) { alert('目前沒有對話記錄可匯出。'); return; } try { const exportData = { modelUsed: currentModel, timestamp: new Date().toISOString(), history: chatHistory }; const jsonString = JSON.stringify(exportData, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); a.download = `grok-chat-${currentModel}-${timestamp}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); closeSidebarIfMobile(); } catch (error) { console.error('Error exporting chat:', error); displayMessage('system', `匯出對話失敗: ${error.message}`, `error-${messageIdCounter++}`, true); } }
    function importChat() { importFileInput.click(); }
    function handleFileImport(event) {
        const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result); let historyToLoad = []; let importedModel = null; let maxId = -1;
                if (Array.isArray(importedData) && importedData.every(item => typeof item === 'object' && item.role && typeof item.content !== 'undefined')) { historyToLoad = importedData.map((item, index) => ({...item, id: `imported-${index}`})); maxId = historyToLoad.length -1; }
                else if (typeof importedData === 'object' && Array.isArray(importedData.history)) { historyToLoad = importedData.history; importedModel = importedData.modelUsed; if (!historyToLoad.every(item => typeof item === 'object' && item.role && typeof item.content !== 'undefined' && item.id)) { console.warn("Imported history has missing IDs, attempting to assign new ones."); historyToLoad = historyToLoad.map((item, index) => ({...item, id: item.id || `imported-${index}`})); } maxId = historyToLoad.reduce((max, item) => { const idNum = parseInt(String(item.id).split('-')[1], 10); return !isNaN(idNum) && idNum > max ? idNum : max; }, -1); }
                else { throw new Error('無法識別的檔案格式。'); }
                chatMessages.innerHTML = ''; chatHistory = historyToLoad; messageIdCounter = maxId + 1; let modelUpdateMessage = `成功從 ${file.name} 匯入對話記錄。`;
                if (importedModel) { const exists = Array.from(modelSelector.options).some(option => option.value === importedModel); if (exists) { modelSelector.value = importedModel; currentModel = importedModel; localStorage.setItem('selectedModel', currentModel); modelUpdateMessage += ` (模型設為: ${currentModel})`; } else { modelUpdateMessage += ` (檔案模型 ${importedModel} 不可用)`; } }
                chatHistory.forEach(message => { if (['user', 'assistant'].includes(message.role)) { displayMessage(message.role, message.content, message.id); } }); displayMessage('system', modelUpdateMessage, `system-${messageIdCounter++}`);
            } catch (error) { console.error('Error importing chat:', error); displayMessage('system', `匯入檔案失敗: ${error.message}`, `error-${messageIdCounter++}`, true); }
            finally { importFileInput.value = ''; closeSidebarIfMobile(); }
        };
        reader.onerror = (e) => { console.error('Error reading file:', e); displayMessage('system', '讀取檔案時發生錯誤。',`error-${messageIdCounter++}` ,true); importFileInput.value = ''; }; reader.readAsText(file);
    }
    function clearChat() { if (chatHistory.length > 0 && confirm('確定要清除所有對話記錄嗎？此操作無法復原。')) { chatHistory = []; chatMessages.innerHTML = ''; displayMessage('system', '對話已清除。', `system-${messageIdCounter++}`); closeSidebarIfMobile(); } else if (chatHistory.length === 0) { displayMessage('system', '對話記錄已是空的。', `system-${messageIdCounter++}`); } }
    // --- 訊息操作處理 ---
    function handleMessageActions(event) {
        const target = event.target; const actionButton = target.closest('.message-actions button'); const editControlsButton = target.closest('.message-edit-controls button'); const messageElement = target.closest('.message[data-id]');
        if (currentEditingMessageId && !target.closest(`[data-id="${currentEditingMessageId}"] .message-edit-area`) && !target.closest(`[data-id="${currentEditingMessageId}"] .message-edit-controls`)) { cancelEdit(currentEditingMessageId); }
        if (messageElement && !actionButton && !editControlsButton && !messageElement.classList.contains('editing') && !target.closest('.message-edit-area')) { const currentlyVisible = document.querySelector('.message.actions-visible'); if (currentlyVisible && currentlyVisible !== messageElement) { currentlyVisible.classList.remove('actions-visible'); } if (currentEditingMessageId !== messageElement.dataset.id) { messageElement.classList.toggle('actions-visible'); } event.stopPropagation(); return; }
        if (actionButton && messageElement && !messageElement.classList.contains('editing')) { const messageId = messageElement.dataset.id; const messageData = chatHistory.find(msg => msg.id === messageId); if (!messageData) return; if (actionButton.classList.contains('action-copy')) { if (messageData.content) { navigator.clipboard.writeText(messageData.content).then(() => { const originalIcon = actionButton.innerHTML; actionButton.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { actionButton.innerHTML = originalIcon; }, 1000); }).catch(err => { console.error('無法複製訊息:', err); alert('複製失敗！'); }); } } else if (actionButton.classList.contains('action-delete')) { if (confirm('確定要刪除此訊息嗎？')) { const messageIndex = chatHistory.findIndex(msg => msg.id === messageId); if (messageIndex > -1) { chatHistory.splice(messageIndex, 1); messageElement.remove(); console.log(`Message ${messageId} deleted.`); } } } else if (actionButton.classList.contains('action-edit')) { startEdit(messageElement, messageData); } hideAllMessageActions(); event.stopPropagation(); return; }
        if (editControlsButton && messageElement && messageElement.classList.contains('editing')) { const messageId = messageElement.dataset.id; if (editControlsButton.classList.contains('save-edit-button')) { saveEdit(messageId, messageElement); } else if (editControlsButton.classList.contains('cancel-edit-button')) { cancelEdit(messageId); } event.stopPropagation(); return; }
        if (!target.closest('.message') && !target.closest('.sidebar') && !target.closest('.mobile-header') && !currentEditingMessageId) { hideAllMessageActions(); }
    }
    function hideAllMessageActions() { document.querySelectorAll('.message.actions-visible').forEach(el => { if (!el.classList.contains('editing')) { el.classList.remove('actions-visible'); } }); }
    // --- 編輯相關函數 ---
    function startEdit(messageElement, messageData) { if (currentEditingMessageId && currentEditingMessageId !== messageData.id) { cancelEdit(currentEditingMessageId); } currentEditingMessageId = messageData.id; messageElement.classList.add('editing'); hideAllMessageActions(); const contentContainer = messageElement.querySelector('.message-content'); if (!contentContainer) return; const editAreaDiv = document.createElement('div'); editAreaDiv.classList.add('message-edit-area'); const textarea = document.createElement('textarea'); textarea.value = messageData.content; textarea.rows = Math.min(10, Math.max(3, messageData.content.split('\n').length)); const controlsDiv = document.createElement('div'); controlsDiv.classList.add('message-edit-controls'); controlsDiv.innerHTML = `<button class="cancel-edit-button">取消</button><button class="save-edit-button">保存</button>`; editAreaDiv.appendChild(textarea); editAreaDiv.appendChild(controlsDiv); messageElement.appendChild(editAreaDiv); textarea.focus(); textarea.select(); }
    function saveEdit(messageId, messageElement) {
        const editArea = messageElement.querySelector('.message-edit-area'); const textarea = editArea?.querySelector('textarea'); if (!textarea || !messageId) return; const newContent = textarea.value.trim(); const messageIndex = chatHistory.findIndex(msg => msg.id === messageId);
        if (messageIndex > -1 && newContent) { const oldMessageData = chatHistory[messageIndex]; chatHistory[messageIndex] = { ...oldMessageData, content: newContent }; const contentContainer = messageElement.querySelector('.message-content'); if (contentContainer) { if (oldMessageData.role === 'user') { contentContainer.textContent = newContent; } else if (oldMessageData.role === 'assistant') { try { const rawHtml = marked.parse(newContent, { gfm: true, breaks: true }); const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }); contentContainer.innerHTML = cleanHtml; } catch (e) { console.error("Error re-rendering edited message:", e); contentContainer.textContent = newContent; } } } editArea.remove(); messageElement.classList.remove('editing'); currentEditingMessageId = null; console.log(`Message ${messageId} updated.`); }
        else if (!newContent) { alert("訊息內容不能為空！"); }
    }
    function cancelEdit(messageId) { const messageElement = document.querySelector(`.message[data-id="${messageId}"]`); if (messageElement) { const editArea = messageElement.querySelector('.message-edit-area'); if (editArea) editArea.remove(); messageElement.classList.remove('editing'); } if (currentEditingMessageId === messageId) { currentEditingMessageId = null; } }
    // --- 動態調整 Textarea 高度 ---
    function adjustTextareaHeight() { const maxHeight = 120; userInput.style.height = 'auto'; const newHeight = Math.min(userInput.scrollHeight, maxHeight); userInput.style.height = `${newHeight}px`; }
    // --- 事件監聽器綁定 ---
    function setupEventListeners() {
        sendButton.addEventListener('click', callGrokApi);
        userInput.addEventListener('input', adjustTextareaHeight);
        themeToggleButton.addEventListener('click', () => { toggleTheme(); closeSidebarIfMobile(); });
        exportButton.addEventListener('click', exportChat);
        importButton.addEventListener('click', importChat);
        importFileInput.addEventListener('change', handleFileImport);
        clearButton.addEventListener('click', clearChat);
        menuToggleButton.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);
        closeSidebarButton.addEventListener('click', closeSidebar);
        connectApiButton.addEventListener('click', handleConnectApiKey);
        clearApiKeyButton.addEventListener('click', handleClearApiKey);
        document.addEventListener('click', handleMessageActions, true);
        console.log("Event listeners attached.");
    }
    // --- 執行初始化 ---
    initializeChat();

}); // <-- 確保這個結尾的 }); 存在！
