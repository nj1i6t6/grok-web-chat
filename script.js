document.addEventListener('DOMContentLoaded', () => {
    // --- 配置區域 ---
    const API_URL_CHAT = 'https://api.x.ai/v1/chat/completions';
    const API_URL_MODELS = 'https://api.x.ai/v1/models';
    let currentModel = 'grok-3-mini-beta';
    let apiKey = null;
    const LOCAL_STORAGE_KEY_HISTORY = 'grokChatHistory'; // 新增：localStorage Key
    const LOCAL_STORAGE_KEY_API_KEY = 'grokApiKey';     // API Key 的 Key
    const LOCAL_STORAGE_KEY_MODEL = 'selectedModel';   // 模型的 Key
    const LOCAL_STORAGE_KEY_THEME = 'theme';           // 主題的 Key


    // --- DOM 元素獲取 ---
    // ... (與之前版本相同) ...
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
    const apiKeyInput = document.getElementById('api-key-input');
    const connectApiButton = document.getElementById('connect-api-button');
    const apiStatus = document.getElementById('api-status');
    const clearApiKeyButton = document.getElementById('clear-api-key-button');

    // --- 狀態變數 ---
    let chatHistory = []; // 會從 localStorage 加載
    let isLoading = false;
    let messageIdCounter = 0; // 需要根據加載的歷史記錄來初始化
    let currentEditingMessageId = null;

    // --- 初始化 ---
    function initializeChat() {
        if (!checkElements()) { /* ... */ return; }
        loadTheme();
        setupModelSelector();
        loadChatHistory(); // **新增：加載聊天記錄**
        loadAndVerifyApiKey();
        adjustTextareaHeight();
        setupEventListeners();
        console.log("Chat initialized successfully.");
    }

    function checkElements() { /* ... 同前 ... */ return true; }

    // --- localStorage 操作 ---
    function saveChatHistory() {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY_HISTORY, JSON.stringify(chatHistory));
        } catch (e) {
            console.error("Error saving chat history to localStorage:", e);
            // 可以考慮給用戶一個提示，例如空間不足
        }
    }

    function loadChatHistory() {
        const savedHistory = localStorage.getItem(LOCAL_STORAGE_KEY_HISTORY);
        let maxId = -1;
        if (savedHistory) {
            try {
                chatHistory = JSON.parse(savedHistory);
                // 驗證讀取的數據結構
                if (!Array.isArray(chatHistory) || !chatHistory.every(item => typeof item === 'object' && item.role && typeof item.content !== 'undefined' && item.id)) {
                     console.error("Invalid chat history format in localStorage. Clearing.");
                     chatHistory = [];
                     localStorage.removeItem(LOCAL_STORAGE_KEY_HISTORY);
                 } else {
                     // 渲染歷史記錄
                     chatMessages.innerHTML = ''; // 清空初始歡迎語
                     chatHistory.forEach(message => {
                         if (['user', 'assistant'].includes(message.role)) {
                             displayMessage(message.role, message.content, message.id);
                         }
                         // 可以選擇是否顯示歷史中的 system message
                         // else if (message.role === 'system') {
                         //     displayMessage(message.role, message.content, message.id);
                         // }

                         // 更新 messageIdCounter
                         const idNum = parseInt(String(message.id).split('-')[1], 10);
                         if (!isNaN(idNum) && idNum > maxId) {
                             maxId = idNum;
                         }
                     });
                     messageIdCounter = maxId + 1; // 設置計數器
                     console.log("Chat history loaded from localStorage.");
                     scrollToBottom(); // 加載完成後滾動到底部
                 }
            } catch (e) {
                console.error("Error parsing chat history from localStorage:", e);
                chatHistory = []; // 解析失敗則清空
                localStorage.removeItem(LOCAL_STORAGE_KEY_HISTORY);
            }
        } else {
             // localStorage 為空，顯示初始歡迎消息（如果 HTML 裡有）
             // 或者可以在這裡動態添加一個歡迎消息
              const initialMsg = document.querySelector('#chat-messages .system-message');
              if (!initialMsg) { // 避免重複添加
                displayMessage('system', '歡迎使用！開始聊天或在側邊欄連線 API。', `system-${messageIdCounter++}`);
              }
        }
    }

    // --- API 金鑰處理 ---
    async function loadAndVerifyApiKey() {
        const storedKey = localStorage.getItem(LOCAL_STORAGE_KEY_API_KEY); // 使用定義的 Key
        if (storedKey) { /* ... 同前 ... */ } else { /* ... 同前 ... */ }
    }
    async function handleConnectApiKey() {
        const inputKey = apiKeyInput.value.trim();
        if (!inputKey) { /* ... */ return; }
        setApiStatus("正在測試連線...", "testing");
        connectApiButton.disabled = true;
        const isValid = await testApiKey(inputKey);
        if (isValid) {
            apiKey = inputKey;
            localStorage.setItem(LOCAL_STORAGE_KEY_API_KEY, apiKey); // 保存 Key
            setApiStatus("連線成功！", "success");
            enableChat(); clearApiKeyButton.style.display = 'block'; apiKeyInput.value = '********'; apiKeyInput.type = 'password'; closeSidebarIfMobile();
        } else {
             apiKey = null; localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); disableChat(); clearApiKeyButton.style.display = 'none';
             // 錯誤信息已在 testApiKey 中設置
        }
        connectApiButton.disabled = false;
    }
    async function testApiKey(keyToTest) { /* ... 同前 ... */ return true; /* or false */ }
    function handleClearApiKey() {
         if (confirm("確定要清除已儲存的 API 金鑰嗎？")) {
             apiKey = null; localStorage.removeItem(LOCAL_STORAGE_KEY_API_KEY); apiKeyInput.value = ''; apiKeyInput.type = 'text'; setApiStatus("金鑰已清除，請重新輸入並連線", ""); disableChat(); clearApiKeyButton.style.display = 'none'; console.log("API Key cleared."); closeSidebarIfMobile();
         }
     }
    function setApiStatus(message, type = "") { /* ... 同前 ... */ }
    function enableChat() { /* ... 同前 ... */ }
    function disableChat() { /* ... 同前 ... */ }

    // --- 主題切換 ---
    function toggleTheme() { body.classList.toggle('dark-mode'); const isDarkMode = body.classList.contains('dark-mode'); localStorage.setItem(LOCAL_STORAGE_KEY_THEME, isDarkMode ? 'dark' : 'light'); const icon = themeToggleButton.querySelector('i'); icon.className = isDarkMode ? 'fas fa-moon' : 'fas fa-sun'; }
    function loadTheme() { const savedTheme = localStorage.getItem(LOCAL_STORAGE_KEY_THEME); if (savedTheme === 'dark') { body.classList.add('dark-mode'); themeToggleButton.querySelector('i').className = 'fas fa-moon'; } else { body.classList.remove('dark-mode'); themeToggleButton.querySelector('i').className = 'fas fa-sun'; } }

    // --- 模型選擇 ---
    function setupModelSelector() { const savedModel = localStorage.getItem(LOCAL_STORAGE_KEY_MODEL); if (savedModel) { const exists = Array.from(modelSelector.options).some(option => option.value === savedModel); if (exists) { modelSelector.value = savedModel; } } currentModel = modelSelector.value; modelSelector.addEventListener('change', () => { currentModel = modelSelector.value; localStorage.setItem(LOCAL_STORAGE_KEY_MODEL, currentModel); displayMessage('system', `模型已切換至: ${currentModel}`, `system-${messageIdCounter++}`); closeSidebarIfMobile(); }); }

    // --- 側邊欄控制 ---
    function openSidebar() { /* ... */ } function closeSidebar() { /* ... */ } function toggleSidebar() { /* ... */ } function closeSidebarIfMobile() { /* ... */ }

    // --- 核心功能函數 ---
    function displayMessage(role, content, id, isError = false) { /* ... 函數本身邏輯不變 ... */ }
    function scrollToBottom() { /* ... */ }

    async function callGrokApi() {
        const userText = userInput.value.trim();
        if (!userText || isLoading) return;
        if (!apiKey) { displayMessage('system', '請先在側邊欄連線 API 金鑰。', `error-${messageIdCounter++}`, true); openSidebar(); return; }
        isLoading = true; sendButton.disabled = true; userInput.disabled = true;

        const userMessageId = `msg-${messageIdCounter++}`;
        chatHistory.push({ role: 'user', content: userText, id: userMessageId });
        saveChatHistory(); // **新增：保存用戶訊息後的歷史記錄**
        displayMessage('user', userText, userMessageId);

        userInput.value = ''; adjustTextareaHeight();
        const loadingId = `loading-${userMessageId}`;
        const loadingIndicator = displayMessage('loading', '', loadingId );

        try {
            const messagesToSend = chatHistory.map(({ role, content }) => ({ role, content }));
            const requestBody = { messages: messagesToSend, model: currentModel, stream: false, temperature: 0.7 };
            const response = await fetch(API_URL_CHAT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(requestBody) });
            const currentLoading = document.getElementById(loadingId); if (currentLoading) chatMessages.removeChild(currentLoading);

            if (!response.ok) { /* ... 錯誤處理同前 ... */ }
            else {
                const data = await response.json();
                if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                    const assistantReply = data.choices[0].message.content.trim();
                    const assistantMessageId = `msg-${messageIdCounter++}`;
                    chatHistory.push({ role: 'assistant', content: assistantReply, id: assistantMessageId });
                    saveChatHistory(); // **新增：保存 AI 訊息後的歷史記錄**
                    displayMessage('assistant', assistantReply, assistantMessageId);
                } else { /* ... */ }
            }
        } catch (error) { /* ... */ }
        finally { /* ... */ }
    }

    // --- 匯出/匯入/清除 功能 ---
    function exportChat() { /* ... 匯出邏輯不變 ... */ }
    function importChat() { /* ... */ }
    function handleFileImport(event) { // **修改：匯入後保存到 localStorage**
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            let historyToLoad = []; let importedModel = null; let maxId = -1; // 移到 try 外部以便 finally 訪問
            try {
                const importedData = JSON.parse(e.target.result);
                // ... (解析和驗證 importedData 的邏輯同前) ...
                if (Array.isArray(importedData) && importedData.every(item => typeof item === 'object' && item.role && typeof item.content !== 'undefined')) { historyToLoad = importedData.map((item, index) => ({...item, id: `imported-${index}`})); maxId = historyToLoad.length -1; }
                else if (typeof importedData === 'object' && Array.isArray(importedData.history)) { historyToLoad = importedData.history; importedModel = importedData.modelUsed; if (!historyToLoad.every(item => typeof item === 'object' && item.role && typeof item.content !== 'undefined' && item.id)) { console.warn("Imported history has missing IDs, attempting to assign new ones."); historyToLoad = historyToLoad.map((item, index) => ({...item, id: item.id || `imported-${index}`})); } maxId = historyToLoad.reduce((max, item) => { const idNum = parseInt(String(item.id).split('-')[1], 10); return !isNaN(idNum) && idNum > max ? idNum : max; }, -1); }
                else { throw new Error('無法識別的檔案格式。'); }

                // 清除現有顯示
                chatMessages.innerHTML = '';
                // **更新 chatHistory 並保存到 localStorage**
                chatHistory = historyToLoad;
                saveChatHistory();
                messageIdCounter = maxId + 1; // 更新計數器

                let modelUpdateMessage = `成功從 ${file.name} 匯入對話記錄。`;
                // ... (模型處理邏輯同前) ...

                // 重新渲染
                chatHistory.forEach(message => { if (['user', 'assistant'].includes(message.role)) { displayMessage(message.role, message.content, message.id); } });
                displayMessage('system', modelUpdateMessage, `system-${messageIdCounter++}`);

            } catch (error) { console.error('Error importing chat:', error); displayMessage('system', `匯入檔案失敗: ${error.message}`, `error-${messageIdCounter++}`, true); }
            finally { importFileInput.value = ''; closeSidebarIfMobile(); }
        };
        reader.onerror = (e) => { /* ... */ }; reader.readAsText(file);
    }
    function clearChat() { // **修改：清除 localStorage**
        if (chatHistory.length > 0 && confirm('確定要清除所有對話記錄嗎？此操作無法復原。')) {
            chatHistory = [];
            messageIdCounter = 0; // 重置計數器
            localStorage.removeItem(LOCAL_STORAGE_KEY_HISTORY); // **從 localStorage 移除**
            chatMessages.innerHTML = ''; // 清空顯示區域
            displayMessage('system', '對話已清除。', `system-${messageIdCounter++}`);
            closeSidebarIfMobile();
        } else if (chatHistory.length === 0) {
            displayMessage('system', '對話記錄已是空的。', `system-${messageIdCounter++}`);
        }
    }

    // --- 訊息操作處理 ---
    function handleMessageActions(event) { /* ... 函數本身邏輯不變 ... */ }
    function hideAllMessageActions() { /* ... */ }

    // --- 編輯相關函數 ---
    function startEdit(messageElement, messageData) { /* ... */ }
    function saveEdit(messageId, messageElement) { // **修改：保存編輯後更新 localStorage**
        const editArea = messageElement.querySelector('.message-edit-area'); const textarea = editArea?.querySelector('textarea'); if (!textarea || !messageId) return;
        const newContent = textarea.value.trim(); const messageIndex = chatHistory.findIndex(msg => msg.id === messageId);
        if (messageIndex > -1 && newContent) {
            const oldMessageData = chatHistory[messageIndex];
            chatHistory[messageIndex] = { ...oldMessageData, content: newContent }; // 更新歷史記錄
            saveChatHistory(); // **保存更新後的歷史記錄**

            const contentContainer = messageElement.querySelector('.message-content'); if (contentContainer) { /* ... 重新渲染邏輯 ... */ }
            editArea.remove(); messageElement.classList.remove('editing'); currentEditingMessageId = null; console.log(`Message ${messageId} updated.`);
        } else if (!newContent) { alert("訊息內容不能為空！"); }
    }
    function cancelEdit(messageId) { /* ... */ }
    function adjustTextareaHeight() { /* ... */ }

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
