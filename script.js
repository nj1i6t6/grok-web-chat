/**
 * Grok Web Chat - V8 (Refactored)
 * Manages frontend logic for interacting with Grok API via localStorage.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const config = {
        apiUrls: {
            chat: 'https://api.x.ai/v1/chat/completions',
            models: 'https://api.x.ai/v1/models' // For connection testing
        },
        localStorageKeys: {
            sessions: 'grokChatSessions_v2',
            activeId: 'grokLastActiveSessionId_v2',
            apiKey: 'grokApiKey',
            model: 'selectedModel',
            theme: 'theme'
        },
        defaultModel: 'grok-3-mini-beta',
        elements: { // Cache DOM elements
            chatMessages: document.getElementById('chat-messages'),
            userInput: document.getElementById('user-input'),
            sendButton: document.getElementById('send-button'),
            modelSelector: document.getElementById('model-selector'),
            exportButton: document.getElementById('export-button'),
            importButton: document.getElementById('import-button'),
            importFileInput: document.getElementById('import-file-input'),
            deleteCurrentChatButton: document.getElementById('delete-current-chat-button'),
            themeToggleButton: document.getElementById('theme-toggle-button'),
            body: document.body,
            sidebar: document.getElementById('sidebar'),
            menuToggleButton: document.getElementById('menu-toggle-button'),
            sidebarOverlay: document.getElementById('sidebar-overlay'),
            closeSidebarButton: document.getElementById('close-sidebar-button'),
            apiKeyInput: document.getElementById('api-key-input'),
            connectApiButton: document.getElementById('connect-api-button'),
            apiStatus: document.getElementById('api-status'),
            clearApiKeyButton: document.getElementById('clear-api-key-button'),
            chatSessionList: document.getElementById('chat-session-list'),
            newChatButton: document.getElementById('new-chat-button'),
            mobileChatTitle: document.getElementById('mobile-chat-title')
        }
    };

    // --- State Management ---
    const state = {
        apiKey: null,
        sessions: [], // Array of { sessionId, name, messages, createdAt, lastUpdatedAt }
        activeSessionId: null,
        currentModel: config.defaultModel,
        currentTheme: 'light',
        isLoading: false,
        currentEditingMessageId: null,
        messageIdCounter: 0 // Used for generating unique message IDs during runtime
    };

    // --- Long Press State (for session rename) ---
    let longPressTimer = null;
    let longPressTargetElement = null;
    const LONG_PRESS_DURATION = 600; // Milliseconds for long press

    // --- Storage Module (LocalStorage interaction) ---
    const storage = {
        saveSessions: () => {
            try {
                const activeSession = state.sessions.find(s => s.sessionId === state.activeSessionId);
                if (activeSession) { activeSession.lastUpdatedAt = Date.now(); }
                state.sessions.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));
                localStorage.setItem(config.localStorageKeys.sessions, JSON.stringify(state.sessions));
                localStorage.setItem(config.localStorageKeys.activeId, state.activeSessionId);
            } catch (e) {
                console.error("Error saving sessions:", e);
                ui.showSystemMessage("保存會話失敗，可能是儲存空間已滿。", `error-storage-${Date.now()}`, true);
            }
        },
        loadSessions: () => {
            const savedData = localStorage.getItem(config.localStorageKeys.sessions);
            if (savedData) {
                try {
                    const loadedSessions = JSON.parse(savedData);
                    if (Array.isArray(loadedSessions) && loadedSessions.every(s => s.sessionId && s.name !== undefined && Array.isArray(s.messages))) {
                        state.sessions = loadedSessions;
                        state.sessions.sort((a, b) => (b.lastUpdatedAt || b.createdAt) - (a.lastUpdatedAt || a.createdAt));
                        return true;
                    } else {
                        console.error("Invalid session data format in storage. Clearing invalid data.");
                        state.sessions = [];
                        localStorage.removeItem(config.localStorageKeys.sessions);
                        localStorage.removeItem(config.localStorageKeys.activeId);
                    }
                } catch (e) {
                    console.error("Error parsing sessions from storage:", e);
                    state.sessions = [];
                }
            }
            return false;
        }, // <<< Comma added here
        saveActiveSessionId: () => localStorage.setItem(config.localStorageKeys.activeId, state.activeSessionId),
        loadActiveSessionId: () => localStorage.getItem(config.localStorageKeys.activeId),
        saveApiKey: () => localStorage.setItem(config.localStorageKeys.apiKey, state.apiKey),
        loadApiKey: () => localStorage.getItem(config.localStorageKeys.apiKey),
        removeApiKey: () => localStorage.removeItem(config.localStorageKeys.apiKey),
        saveTheme: () => localStorage.setItem(config.localStorageKeys.theme, state.currentTheme),
        loadTheme: () => localStorage.getItem(config.localStorageKeys.theme) || 'light',
        saveModel: () => localStorage.setItem(config.localStorageKeys.model, state.currentModel),
        loadModel: () => localStorage.getItem(config.localStorageKeys.model) || config.defaultModel,
    };

    // --- UI Module (DOM Manipulation) ---
    const ui = {
        getElement: (key) => config.elements[key],
        renderMessage: (message) => {
            const { role, content, id, isError = false, edited = false } = message;
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message');
            if (id) messageDiv.dataset.id = id;
            const contentContainer = document.createElement('div');
            contentContainer.classList.add('message-content');
            switch (role) {
                case 'user':
                    messageDiv.classList.add('user-message');
                    contentContainer.textContent = content;
                    break;
                case 'assistant':
                    messageDiv.classList.add('assistant-message');
                    try {
                        const rawHtml = marked.parse(content, { gfm: true, breaks: true });
                        const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
                        contentContainer.innerHTML = cleanHtml;
                    } catch (e) {
                        console.error("Error rendering assistant message:", e);
                        contentContainer.textContent = content;
                        messageDiv.style.border = '1px dashed red';
                    }
                    break;
                default: return null;
            }
            messageDiv.appendChild(contentContainer);
            if (id && (role === 'user' || role === 'assistant')) {
                const actionsContainer = document.createElement('div');
                actionsContainer.classList.add('message-actions');
                actionsContainer.innerHTML = `
                    <button class="action-button action-copy" title="複製"><i class="fas fa-copy"></i></button>
                    <button class="action-button action-edit" title="編輯"><i class="fas fa-pencil-alt"></i></button>
                    <button class="action-button action-delete" title="刪除"><i class="fas fa-trash-alt"></i></button>
                    ${edited ? '<span class="edited-indicator" title="已編輯"><i class="fas fa-history"></i></span>' : ''}
                `;
                messageDiv.appendChild(actionsContainer);
            }
            return messageDiv;
        },
        renderMessages: (messages = []) => {
            const messagesContainer = ui.getElement('chatMessages');
            messagesContainer.innerHTML = '';
            state.messageIdCounter = 0;
            let maxMsgIdNum = -1;
            if (messages.length === 0) {
                ui.showSystemMessage("這個聊天是空的，開始輸入訊息吧！", `system-empty-${state.activeSessionId || 'init'}`);
            } else {
                messages.forEach(msg => {
                    const messageElement = ui.renderMessage(msg);
                    if (messageElement) {
                        messagesContainer.appendChild(messageElement);
                        if (msg.id) {
                            const idParts = String(msg.id).split('-');
                            const idNum = parseInt(idParts[idParts.length - 1], 10);
                            if (!isNaN(idNum) && idNum > maxMsgIdNum) maxMsgIdNum = idNum;
                        }
                    } else if (msg.role === 'system') {
                        ui.showSystemMessage(msg.content, msg.id, msg.isError);
                    }
                });
                state.messageIdCounter = maxMsgIdNum + 1;
            }
            ui.scrollToBottom();
        },
        renderSessionList: () => {
            const listContainer = ui.getElement('chatSessionList');
            listContainer.innerHTML = '';
            if (state.sessions.length === 0) {
                const li = document.createElement('li');
                li.textContent = "無聊天記錄"; li.style.padding = '10px'; li.style.textAlign = 'center'; li.style.color = 'var(--text-muted)'; li.style.fontSize = '0.8em';
                listContainer.appendChild(li);
                return;
            }
            state.sessions.forEach(session => {
                const li = document.createElement('li');
                li.classList.add('session-item');
                li.dataset.sessionId = session.sessionId;
                if (session.sessionId === state.activeSessionId) li.classList.add('active');

                const nameSpan = document.createElement('span');
                nameSpan.classList.add('session-name');
                nameSpan.textContent = session.name || `聊天 ${session.sessionId.slice(-4)}`;
                nameSpan.title = nameSpan.textContent;

                const renameButton = document.createElement('button');
                renameButton.classList.add('session-rename-button');
                renameButton.title = "重新命名";
                renameButton.innerHTML = '<i class="fas fa-pen"></i>';
                renameButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    events.handleSessionRename(session.sessionId);
                    li.classList.remove('rename-visible'); // Hide after click
                });

                li.appendChild(nameSpan);
                li.appendChild(renameButton);

                // Click on the list item itself selects the session
                li.addEventListener('click', (e) => {
                    if (e.target.closest('.session-rename-button')) return; // Don't select if rename clicked
                    events.handleSessionSelect(session.sessionId);
                });
                // Add long press event listeners
                li.addEventListener('mousedown', events.handleSessionPressStart);
                li.addEventListener('mouseup', events.handleSessionPressEnd);
                li.addEventListener('mouseleave', events.handleSessionPressEnd);
                li.addEventListener('touchstart', events.handleSessionPressStart, { passive: true });
                li.addEventListener('touchend', events.handleSessionPressEnd);
                li.addEventListener('touchmove', events.handleSessionPressEnd); // Cancel long press if finger moves

                listContainer.appendChild(li);
            });
        },
        loadSessionUI: (sessionId) => {
            const session = state.sessions.find(s => s.sessionId === sessionId);
            if (!session) { console.error(`Attempted to load non-existent session UI: ${sessionId}`); ui.showSystemMessage(`錯誤：找不到 ID 為 ${sessionId} 的聊天記錄。`, `error-load-${sessionId}`, true); return; }
            state.activeSessionId = sessionId;
            storage.saveActiveSessionId();
            document.querySelectorAll('#chat-session-list li').forEach(li => {
                li.classList.toggle('active', li.dataset.sessionId === sessionId);
            });
            ui.getElement('mobileChatTitle').textContent = session.name || `聊天 ${session.sessionId.slice(-4)}`;
            ui.renderMessages(session.messages);
        },
        showSystemMessage: (content, id, isError = false) => {
            const messagesContainer = ui.getElement('chatMessages');
            const existingMsg = id ? messagesContainer.querySelector(`.message[data-id="${id}"]`) : null;
            if (existingMsg) { existingMsg.textContent = content; existingMsg.classList.toggle('error-message', isError); return; }
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', 'system-message');
            if (id) messageDiv.dataset.id = id;
            if (isError) messageDiv.classList.add('error-message');
            messageDiv.textContent = content;
            messagesContainer.appendChild(messageDiv);
            ui.scrollToBottom();
        },
        showLoadingIndicator: (loadingId) => {
            ui.removeElementById(loadingId);
            const messagesContainer = ui.getElement('chatMessages');
            const loadingDiv = document.createElement('div');
            loadingDiv.classList.add('message', 'loading-message');
            loadingDiv.id = loadingId;
            loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI 思考中...';
            messagesContainer.appendChild(loadingDiv);
            ui.scrollToBottom();
            return loadingDiv;
        },
        removeElementById: (id) => { const element = document.getElementById(id); if (element) element.remove(); },
        scrollToBottom: () => { requestAnimationFrame(() => { const messagesContainer = ui.getElement('chatMessages'); messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' }); }); },
        updateApiStatus: (message, type = "") => { const apiStatusEl = ui.getElement('apiStatus'); apiStatusEl.textContent = message; apiStatusEl.className = `api-status-message status-${type}`; },
        updateChatInputState: (enabled) => {
            const userInputEl = ui.getElement('userInput'); const sendButtonEl = ui.getElement('sendButton');
            const shouldEnable = enabled && !!state.apiKey;
            userInputEl.disabled = !shouldEnable; sendButtonEl.disabled = !shouldEnable;
            userInputEl.classList.toggle('chat-disabled', !shouldEnable); sendButtonEl.classList.toggle('chat-disabled', !shouldEnable);
            userInputEl.placeholder = shouldEnable ? "輸入訊息... (Shift+Enter 換行)" : (state.apiKey ? "點擊 '連線' 按鈕測試連線..." : "請先連線 API...");
        },
        updateThemeUI: () => { ui.getElement('body').classList.toggle('dark-mode', state.currentTheme === 'dark'); const icon = ui.getElement('themeToggleButton').querySelector('i'); icon.className = state.currentTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun'; },
        adjustTextareaHeight: () => { const textarea = ui.getElement('userInput'); const maxHeight = 120; textarea.style.height = 'auto'; const newHeight = Math.min(textarea.scrollHeight, maxHeight); textarea.style.height = `${newHeight}px`; },
        showEditUI: (messageElement, initialContent) => {
            messageElement.classList.add('editing'); ui.hideAllMessageActions();
            const contentContainer = messageElement.querySelector('.message-content'); if (!contentContainer) return;
            const editAreaDiv = document.createElement('div'); editAreaDiv.classList.add('message-edit-area');
            const textarea = document.createElement('textarea'); textarea.value = initialContent;
            textarea.rows = Math.min(10, Math.max(3, initialContent.split('\n').length));
            ui.adjustTextareaHeightForEdit(textarea);
            textarea.addEventListener('input', () => ui.adjustTextareaHeightForEdit(textarea));
            const controlsDiv = document.createElement('div'); controlsDiv.classList.add('message-edit-controls');
            controlsDiv.innerHTML = `<button class="cancel-edit-button">取消</button><button class="save-edit-button">保存</button>`;
            editAreaDiv.appendChild(textarea); editAreaDiv.appendChild(controlsDiv);
            messageElement.appendChild(editAreaDiv);
            textarea.focus(); textarea.select();
        },
        hideEditUI: (messageElement) => { const editArea = messageElement?.querySelector('.message-edit-area'); if (editArea) editArea.remove(); messageElement?.classList.remove('editing'); },
        hideAllMessageActions: () => { document.querySelectorAll('.message.actions-visible').forEach(el => { if (!el.classList.contains('editing')) el.classList.remove('actions-visible'); }); },
        adjustTextareaHeightForEdit: (textarea) => { const maxHeight = 200; textarea.style.height = 'auto'; const newHeight = Math.min(textarea.scrollHeight, maxHeight); textarea.style.height = `${newHeight}px`; },
        closeSidebarIfMobile: () => { if (window.innerWidth <= 768) events.handleCloseSidebar(); },
        // Helper to hide all visible rename buttons
        hideAllRenameButtons: () => { document.querySelectorAll('#chat-session-list li.rename-visible').forEach(item => item.classList.remove('rename-visible')); }
    };

    // --- API Module (Backend Communication) ---
    const api = {
        testApiKey: async (keyToTest) => { try { const response = await fetch(config.apiUrls.models, { method: 'GET', headers: { 'Authorization': `Bearer ${keyToTest}` } }); if (response.ok) return true; else { let errorMsg = `連線失敗 (${response.status})`; try { const errorData = await response.json(); errorMsg += `: ${errorData.error?.message || errorData.error || JSON.stringify(errorData)}`; } catch(e) { errorMsg += `: ${response.statusText}`; } ui.updateApiStatus(errorMsg, "error"); console.error("API Key validation failed:", errorMsg); return false; } } catch (error) { ui.updateApiStatus(`網路錯誤: ${error.message}`, "error"); console.error("Error testing API key:", error); return false; } },
        callGrokApi: async () => {
            const userInputEl = ui.getElement('userInput'); const userText = userInputEl.value.trim(); if (!userText || state.isLoading) return;
            if (!state.apiKey) { ui.showSystemMessage('請先在側邊欄連線 API 金鑰。', `error-no-api-${logic.generateMessageId()}`, true); events.handleSidebarToggle(true); return; }
            if (!state.activeSessionId) { ui.showSystemMessage('錯誤：沒有活動的聊天會話。請嘗試新增或選擇一個聊天。', `error-no-session-${logic.generateMessageId()}`, true); return; }
            state.isLoading = true; ui.updateChatInputState(false);
            const userMessageId = logic.generateMessageId(); const userMessage = { role: 'user', content: userText, id: userMessageId, timestamp: Date.now() };
            logic.addMessageToCurrentSession(userMessage);
            ui.getElement('chatMessages').appendChild(ui.renderMessage(userMessage)); ui.scrollToBottom();
            userInputEl.value = ''; ui.adjustTextareaHeight();
            const loadingId = `loading-${userMessageId}`; ui.showLoadingIndicator(loadingId);
            try {
                const currentSessionMessages = logic.getCurrentSessionMessages();
                const messagesToSend = currentSessionMessages.filter(msg => ['user', 'assistant'].includes(msg.role)).map(({ role, content }) => ({ role, content }));
                const requestBody = { messages: messagesToSend, model: state.currentModel, stream: false, temperature: 0.7 };
                const response = await fetch(config.apiUrls.chat, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.apiKey}` }, body: JSON.stringify(requestBody) });
                ui.removeElementById(loadingId);
                if (!response.ok) {
                    let errorText = await response.text(); let errorMessage = `API 請求失敗 (${response.status} ${response.statusText})`;
                    try { const errorJson = JSON.parse(errorText); errorMessage += `: ${errorJson.error?.message || errorJson.error || JSON.stringify(errorJson)}`; } catch (e) { errorMessage += `\n回應: ${errorText}`; }
                    if (response.status === 401 || response.status === 403) { errorMessage += " 金鑰可能已失效或無效，請檢查並重新連線。"; logic.clearApiKey(false); }
                    console.error('API Error:', errorMessage); ui.showSystemMessage(errorMessage, `error-api-${logic.generateMessageId()}`, true);
                } else {
                    const data = await response.json();
                    if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
                        const assistantReply = data.choices[0].message.content.trim(); const assistantMessageId = logic.generateMessageId();
                        const assistantMessage = { role: 'assistant', content: assistantReply, id: assistantMessageId, timestamp: Date.now() };
                        logic.addMessageToCurrentSession(assistantMessage);
                        const newMsgElement = ui.renderMessage(assistantMessage); if(newMsgElement) ui.getElement('chatMessages').appendChild(newMsgElement); ui.scrollToBottom();
                    } else { console.error('Invalid API response structure:', data); ui.showSystemMessage('收到無效的 API 回應格式。', `error-api-format-${logic.generateMessageId()}`, true); }
                }
            } catch (error) { console.error('Error calling Grok API:', error); ui.removeElementById(loadingId); if (error.message && !error.message.includes('API 請求失敗')) { ui.showSystemMessage(`客戶端網路或處理錯誤: ${error.message}`, `error-client-${logic.generateMessageId()}`, true); } } finally { state.isLoading = false; ui.updateChatInputState(true); userInputEl.focus(); }
        }
    };

     // --- Logic / Business Rules ---
     const logic = {
        generateSessionId: () => `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        generateMessageId: () => `msg-${state.messageIdCounter++}`,
        getCurrentSession: () => state.sessions.find(s => s.sessionId === state.activeSessionId),
        getCurrentSessionMessages: () => logic.getCurrentSession()?.messages || [],
        addMessageToCurrentSession: (message) => { const session = logic.getCurrentSession(); if (session) { if (!message.id) { message.id = logic.generateMessageId(); console.warn("Message added without ID, generated:", message.id); } session.messages.push(message); storage.saveSessions(); } else { console.error("Cannot add message: No active session found."); ui.showSystemMessage("錯誤：無法將訊息添加到當前聊天中，找不到活動會話。", `error-add-msg-${Date.now()}`, true); } },
        updateMessageInSession: (sessionId, messageId, newContent) => { const session = state.sessions.find(s => s.sessionId === sessionId); const messageIndex = session?.messages.findIndex(msg => msg.id === messageId); if (session && messageIndex !== undefined && messageIndex > -1) { session.messages[messageIndex].content = newContent; session.messages[messageIndex].edited = true; session.messages[messageIndex].lastUpdatedAt = Date.now(); storage.saveSessions(); return true; } console.error(`Failed to update message: session ${sessionId}, message ${messageId}`); return false; },
        deleteMessageFromSession: (sessionId, messageId) => { const session = state.sessions.find(s => s.sessionId === sessionId); const messageIndex = session?.messages.findIndex(msg => msg.id === messageId); if (session && messageIndex !== undefined && messageIndex > -1) { session.messages.splice(messageIndex, 1); storage.saveSessions(); return true; } console.error(`Failed to delete message: session ${sessionId}, message ${messageId}`); return false; },
        deleteSession: (sessionId) => { const sessionIndex = state.sessions.findIndex(s => s.sessionId === sessionId); if (sessionIndex > -1) { state.sessions.splice(sessionIndex, 1); storage.saveSessions(); return true; } console.error(`Failed to delete session: ${sessionId}`); return false; },
        renameSession: (sessionId, newName) => { const session = state.sessions.find(s => s.sessionId === sessionId); const trimmedName = newName?.trim(); if (session && trimmedName) { session.name = trimmedName; storage.saveSessions(); return true; } console.warn(`Failed to rename session ${sessionId} to "${newName}" (name empty or session not found)`); return false; },
        clearApiKey: (confirmUser = true) => { const doClear = !confirmUser || confirm("確定要清除已儲存的 API 金鑰嗎？"); if (doClear) { state.apiKey = null; storage.removeApiKey(); ui.getElement('apiKeyInput').value = ''; ui.getElement('apiKeyInput').type = 'text'; ui.updateApiStatus("金鑰已清除，請重新輸入並連線", ""); ui.updateChatInputState(false); ui.getElement('clearApiKeyButton').style.display = 'none'; console.log("API Key cleared."); return true; } return false; }
     };

    // --- Event Handling Module ---
    const events = {
        handleApiKeyConnection: () => {
            const inputKey = ui.getElement('apiKeyInput').value.trim(); if (!inputKey) { ui.updateApiStatus("請輸入 API 金鑰", "error"); return; }
            ui.updateApiStatus("正在測試連線...", "testing"); ui.getElement('connectApiButton').disabled = true; ui.getElement('apiKeyInput').disabled = true;
            api.testApiKey(inputKey).then(isValid => {
                if (isValid) { state.apiKey = inputKey; storage.saveApiKey(); ui.updateApiStatus("連線成功！", "success"); ui.updateChatInputState(true); ui.getElement('clearApiKeyButton').style.display = 'block'; ui.getElement('apiKeyInput').value = '********'; ui.getElement('apiKeyInput').type = 'password'; ui.closeSidebarIfMobile(); }
                else { state.apiKey = null; storage.removeApiKey(); ui.updateChatInputState(false); ui.getElement('clearApiKeyButton').style.display = 'none'; ui.getElement('apiKeyInput').type = 'text'; }
                ui.getElement('connectApiButton').disabled = false; ui.getElement('apiKeyInput').disabled = false;
            });
        },
        handleClearApiKey: () => { if (logic.clearApiKey(true)) { ui.closeSidebarIfMobile(); } },
        handleNewChat: () => {
            if (state.currentEditingMessageId) { if (!confirm("您正在編輯訊息，新增聊天將丟失未保存的更改。確定要繼續嗎？")) { return; } events.handleCancelEdit(state.currentEditingMessageId); }
            const now = Date.now(); const newSession = { sessionId: logic.generateSessionId(), name: `新聊天 ${new Date(now).toLocaleTimeString('zh-TW', { hour12: false })}`, messages: [], createdAt: now, lastUpdatedAt: now };
            state.sessions.unshift(newSession); state.activeSessionId = newSession.sessionId;
            storage.saveSessions(); ui.renderSessionList(); ui.loadSessionUI(newSession.sessionId);
            ui.closeSidebarIfMobile(); ui.getElement('userInput').focus();
        },
        handleSessionSelect: (sessionId) => {
            if (state.currentEditingMessageId) { const messageElement = document.querySelector(`.message[data-id="${state.currentEditingMessageId}"]`); const editTextArea = messageElement?.querySelector('.message-edit-area textarea'); const originalContent = logic.getCurrentSession()?.messages.find(m => m.id === state.currentEditingMessageId)?.content; if (editTextArea && editTextArea.value.trim() !== originalContent?.trim()) { if (!confirm("您正在編輯訊息，切換聊天將丟失未保存的更改。確定要切換嗎？")) { return; } } events.handleCancelEdit(state.currentEditingMessageId); }
            if (sessionId !== state.activeSessionId) ui.loadSessionUI(sessionId);
            ui.closeSidebarIfMobile();
            ui.hideAllRenameButtons(); // Hide rename button on selection
        },
        handleSessionRename: (sessionId) => {
            const session = state.sessions.find(s => s.sessionId === sessionId); if (!session) return;
            const currentName = session.name || `聊天 ${sessionId.slice(-4)}`; const newName = prompt("請輸入新的聊天名稱：", currentName);
            if (newName !== null) { if (logic.renameSession(sessionId, newName)) { ui.renderSessionList(); if (sessionId === state.activeSessionId) ui.getElement('mobileChatTitle').textContent = newName.trim() || `聊天 ${sessionId.slice(-4)}`; } else if (!newName || !newName.trim()){ alert("聊天名稱不能為空！"); } }
            // No need to explicitly hide button here, renderSessionList redraws it hidden
        },
        handleExportChat: () => {
            const currentSession = logic.getCurrentSession(); if (!currentSession || currentSession.messages.length === 0) { alert('目前聊天沒有內容可匯出。'); return; }
            try { const exportData = { formatVersion: "GrokWebChat_v1", sessionId: currentSession.sessionId, name: currentSession.name, modelUsed: state.currentModel, timestamp: new Date().toISOString(), createdAt: currentSession.createdAt, lastUpdatedAt: currentSession.lastUpdatedAt, history: currentSession.messages };
                const jsonString = JSON.stringify(exportData, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); const safeName = (currentSession.name || currentSession.sessionId.slice(-4)).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase(); a.download = `grok-chat-${safeName}-${timestamp}.json`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); ui.closeSidebarIfMobile();
            } catch (error) { console.error('Error exporting chat:', error); ui.showSystemMessage(`匯出對話失敗: ${error.message}`, `error-export-${logic.generateMessageId()}`, true); }
        },
        handleImportClick: () => { ui.getElement('importFileInput').click(); },
        handleFileImport: (event) => {
            const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
            reader.onload = (e) => {
                try { const importedData = JSON.parse(e.target.result); let historyToLoad = []; let sessionName = `導入 ${file.name.split('.')[0]} ${new Date().toLocaleTimeString('zh-TW', { hour12: false })}`; let importedModel = null; let createdAt = Date.now(); let lastUpdatedAt = Date.now();
                    if (Array.isArray(importedData) && importedData.every(item => typeof item === 'object' && item.role && typeof item.content !== 'undefined')) { historyToLoad = importedData.map(item => ({...item, id: item.id || `imported-${logic.generateMessageId()}`})); }
                    else if (typeof importedData === 'object' && Array.isArray(importedData.history)) { historyToLoad = importedData.history.map(item => ({...item, id: item.id || `imported-${logic.generateMessageId()}`})); sessionName = importedData.name || sessionName; importedModel = importedData.modelUsed; createdAt = importedData.createdAt || createdAt; lastUpdatedAt = importedData.lastUpdatedAt || lastUpdatedAt; }
                    else { throw new Error('無法識別的檔案格式。請確認檔案是聊天記錄陣列或之前匯出的 JSON 檔案。'); }
                    if (historyToLoad.length === 0) { throw new Error('匯入的檔案沒有有效的聊天訊息。'); }
                    historyToLoad = historyToLoad.filter(msg => msg.role && typeof msg.content === 'string'); if (historyToLoad.length === 0) { throw new Error('過濾後，匯入的檔案沒有有效的聊天訊息。'); }
                    const newSessionId = logic.generateSessionId(); const newSession = { sessionId: newSessionId, name: sessionName, messages: historyToLoad, createdAt, lastUpdatedAt }; state.sessions.unshift(newSession);
                    if (importedModel) { const modelSelector = ui.getElement('modelSelector'); const exists = Array.from(modelSelector.options).some(option => option.value === importedModel); if (exists) { modelSelector.value = importedModel; state.currentModel = importedModel; storage.saveModel(); } else { console.warn(`Imported model "${importedModel}" not found in selector.`); } }
                    state.activeSessionId = newSessionId; storage.saveSessions(); ui.renderSessionList(); ui.loadSessionUI(newSessionId); ui.showSystemMessage(`成功從 ${file.name} 匯入為新聊天。`, `system-import-${logic.generateMessageId()}`);
                } catch (error) { console.error('Error importing chat:', error); ui.showSystemMessage(`匯入檔案失敗: ${error.message}`, `error-import-${logic.generateMessageId()}`, true); }
                finally { ui.getElement('importFileInput').value = ''; ui.closeSidebarIfMobile(); }
            };
            reader.onerror = (e) => { console.error('Error reading file:', e); ui.showSystemMessage('讀取檔案時發生錯誤。',`error-readfile-${logic.generateMessageId()}` ,true); ui.getElement('importFileInput').value = ''; };
            reader.readAsText(file);
        },
        handleDeleteCurrentChat: () => {
            if (!state.activeSessionId) { alert("沒有選擇要刪除的聊天。"); return; } if (state.sessions.length <= 1) { alert("無法刪除最後一個聊天會話。您可以新增一個新的聊天後再刪除此聊天。"); return; }
            const currentSession = logic.getCurrentSession();
            if (currentSession && confirm(`確定要永久刪除聊天 "${currentSession.name || '此聊天'}" 嗎？此操作無法復原。`)) {
                const sessionIndex = state.sessions.findIndex(s => s.sessionId === state.activeSessionId); const deletedSessionId = state.activeSessionId;
                if (logic.deleteSession(state.activeSessionId)) { let nextSessionId = null; if (state.sessions.length > 0) { const nextIndex = Math.max(0, sessionIndex - 1); nextSessionId = state.sessions[nextIndex]?.sessionId; } ui.renderSessionList(); if (nextSessionId) { ui.loadSessionUI(nextSessionId); } else { events.handleNewChat(); } }
            }
            ui.closeSidebarIfMobile();
        },
        handleThemeToggle: () => { state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light'; storage.saveTheme(); ui.updateThemeUI(); ui.closeSidebarIfMobile(); },
        handleSendMessage: () => { api.callGrokApi(); },
        handleModelChange: () => { state.currentModel = ui.getElement('modelSelector').value; storage.saveModel(); ui.showSystemMessage(`模型已切換至: ${state.currentModel}`, `system-model-${logic.generateMessageId()}`); ui.closeSidebarIfMobile(); },
        handleSidebarToggle: (forceOpen = false) => { const body = ui.getElement('body'); if (forceOpen) body.classList.add('sidebar-open'); else body.classList.toggle('sidebar-open'); },
        handleCloseSidebar: () => { ui.getElement('body').classList.remove('sidebar-open'); },
        handleTextareaInput: () => { ui.adjustTextareaHeight(); },
        handleTextareaKeydown: (event) => { if (event.key === 'Enter' && !event.shiftKey && !state.isLoading) { event.preventDefault(); events.handleSendMessage(); } },
        handleMessageActions: (event) => {
            const target = event.target;
            // Click outside relevant areas? Hide actions / cancel edit.
            if (!target.closest('.message') && !target.closest('.sidebar') && !target.closest('.mobile-header') && !target.closest('.message-edit-area')) { if (state.currentEditingMessageId) events.handleCancelEdit(state.currentEditingMessageId); ui.hideAllMessageActions(); return; }
            const messageElement = target.closest('.message[data-id]'); if (!messageElement) return; const messageId = messageElement.dataset.id;
            // Handle clicks within the edit controls of *this* message
            if (messageElement.classList.contains('editing')) { const saveButton = target.closest('.save-edit-button'); const cancelButton = target.closest('.cancel-edit-button'); if (saveButton) events.handleSaveEdit(messageId, messageElement); else if (cancelButton) events.handleCancelEdit(messageId); return; }
            // Clicked on a different message while another is being edited? Cancel the old edit.
            if (state.currentEditingMessageId && state.currentEditingMessageId !== messageId) events.handleCancelEdit(state.currentEditingMessageId);
            // Handle clicks on action buttons
            const actionButton = target.closest('.message-actions .action-button');
            if (actionButton) { const messageData = logic.getCurrentSession()?.messages.find(msg => msg.id === messageId); if (!messageData) return; if (actionButton.classList.contains('action-copy')) events.handleCopyMessage(messageData.content, actionButton); else if (actionButton.classList.contains('action-delete')) events.handleDeleteMessage(messageId, messageElement); else if (actionButton.classList.contains('action-edit')) events.handleStartEdit(messageElement, messageData); ui.hideAllMessageActions(); event.stopPropagation(); return; }
            // Clicked directly on the message body - toggle action visibility
            if (!target.closest('.message-actions') && !target.closest('.message-edit-area')) { const currentlyVisible = document.querySelector('.message.actions-visible'); if (currentlyVisible && currentlyVisible !== messageElement) currentlyVisible.classList.remove('actions-visible'); messageElement.classList.toggle('actions-visible'); event.stopPropagation(); }
        },
        handleCopyMessage: (content, buttonElement) => { if (!content) return; navigator.clipboard.writeText(content).then(() => { const originalIcon = buttonElement.innerHTML; buttonElement.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { if(buttonElement) buttonElement.innerHTML = originalIcon; }, 1000); }).catch(err => { console.error('Failed to copy message:', err); alert('複製失敗！可能是瀏覽器不支援或未授予權限。'); }); },
        handleDeleteMessage: (messageId, messageElement) => { if (confirm('確定要刪除此訊息嗎？')) { if (logic.deleteMessageFromSession(state.activeSessionId, messageId)) messageElement.remove(); } },
        handleStartEdit: (messageElement, messageData) => { if (state.currentEditingMessageId && state.currentEditingMessageId !== messageData.id) events.handleCancelEdit(state.currentEditingMessageId); state.currentEditingMessageId = messageData.id; ui.showEditUI(messageElement, messageData.content); },
        handleSaveEdit: (messageId, messageElement) => {
            const textarea = messageElement.querySelector('.message-edit-area textarea'); if (!textarea) return; const newContent = textarea.value.trim(); const originalMessage = logic.getCurrentSession()?.messages.find(msg => msg.id === messageId);
            if (newContent && originalMessage && newContent !== originalMessage.content) { if (logic.updateMessageInSession(state.activeSessionId, messageId, newContent)) { const contentContainer = messageElement.querySelector('.message-content'); const editedIndicator = messageElement.querySelector('.edited-indicator'); if (contentContainer && originalMessage) { if (originalMessage.role === 'user') { contentContainer.textContent = newContent; } else if (originalMessage.role === 'assistant') { try { const rawHtml = marked.parse(newContent, { gfm: true, breaks: true }); contentContainer.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }); } catch (e) { contentContainer.textContent = newContent; } } if (!editedIndicator) { const actionsContainer = messageElement.querySelector('.message-actions'); if (actionsContainer) actionsContainer.insertAdjacentHTML('beforeend', '<span class="edited-indicator" title="已編輯"><i class="fas fa-history"></i></span>'); } } ui.hideEditUI(messageElement); state.currentEditingMessageId = null; } }
            else if (newContent === originalMessage?.content) { ui.hideEditUI(messageElement); state.currentEditingMessageId = null; }
            else { alert("訊息內容不能為空！"); }
        },
        handleCancelEdit: (messageId) => { const messageElement = document.querySelector(`.message[data-id="${messageId}"]`); if (messageElement && messageElement.classList.contains('editing')) ui.hideEditUI(messageElement); if (state.currentEditingMessageId === messageId) state.currentEditingMessageId = null; },

        // --- Long Press Handlers ---
        handleSessionPressStart: (event) => {
            const targetLi = event.target.closest('.session-item');
            if (!targetLi) return;
            clearTimeout(longPressTimer); // Clear previous timer
            longPressTargetElement = targetLi; // Record target
            // Start timer for long press
            longPressTimer = setTimeout(() => {
                if (longPressTargetElement === targetLi) { // Check if still pressing same element
                    ui.hideAllRenameButtons(); // Hide others first
                    targetLi.classList.add('rename-visible'); // Show this one
                }
                longPressTimer = null; // Timer finished
            }, LONG_PRESS_DURATION);
        },
        handleSessionPressEnd: (event) => {
            clearTimeout(longPressTimer); // Clear timer if released early
            longPressTimer = null;
            longPressTargetElement = null; // Reset target
            // Do NOT hide the button here - let click outside handle it
        },
        handleDocumentClickForHideRename: (event) => {
            // Hide rename buttons if clicked outside a rename button itself
            const clickedRenameButton = event.target.closest('.session-rename-button');
            const clickedListItem = event.target.closest('.session-item'); // Check if click is inside list area

            // If click is outside the session list OR inside but NOT on a rename button
            if (!clickedListItem || (clickedListItem && !clickedRenameButton)) {
                ui.hideAllRenameButtons();
            }
        }
        // --- End Long Press Handlers ---
    };

    // --- Event Listener Setup ---
    function setupEventListeners() {
        // General UI Listeners
        ui.getElement('sendButton').addEventListener('click', events.handleSendMessage);
        ui.getElement('userInput').addEventListener('input', events.handleTextareaInput);
        ui.getElement('userInput').addEventListener('keydown', events.handleTextareaKeydown);
        ui.getElement('themeToggleButton').addEventListener('click', events.handleThemeToggle);
        ui.getElement('exportButton').addEventListener('click', events.handleExportChat);
        ui.getElement('importButton').addEventListener('click', events.handleImportClick);
        ui.getElement('importFileInput').addEventListener('change', events.handleFileImport);
        ui.getElement('deleteCurrentChatButton').addEventListener('click', events.handleDeleteCurrentChat);
        ui.getElement('menuToggleButton').addEventListener('click', () => events.handleSidebarToggle());
        ui.getElement('sidebarOverlay').addEventListener('click', events.handleCloseSidebar);
        ui.getElement('closeSidebarButton').addEventListener('click', events.handleCloseSidebar);
        ui.getElement('connectApiButton').addEventListener('click', events.handleApiKeyConnection);
        ui.getElement('clearApiKeyButton').addEventListener('click', events.handleClearApiKey);
        ui.getElement('newChatButton').addEventListener('click', events.handleNewChat);
        ui.getElement('modelSelector').addEventListener('change', events.handleModelChange);

        // Event delegation for message actions (copy, edit, delete, click-to-show)
        ui.getElement('chatMessages').addEventListener('click', events.handleMessageActions);

        // Global listeners for hiding rename buttons / cancelling edits
        document.addEventListener('mousedown', events.handleDocumentClickForHideRename, true); // Capture phase
        document.addEventListener('touchstart', events.handleDocumentClickForHideRename, true); // Capture phase

        // Note: Session list item listeners are now added dynamically in renderSessionList

        // console.log("Event listeners attached.");
    }

    // --- App Initialization Function ---
    function initializeChat() {
        console.log("Initializing chat...");
        // 1. Load persistent data
        state.currentTheme = storage.loadTheme();
        state.apiKey = storage.loadApiKey();
        state.currentModel = storage.loadModel();

        // 2. Load sessions and determine active session
        const sessionsLoaded = storage.loadSessions();
        if (!sessionsLoaded || state.sessions.length === 0) {
            events.handleNewChat(); // Create initial if none exist/load failed
        } else {
            const lastActiveId = storage.loadActiveSessionId();
            if (lastActiveId && state.sessions.some(s => s.sessionId === lastActiveId)) {
                state.activeSessionId = lastActiveId;
            } else if (state.sessions.length > 0) {
                state.activeSessionId = state.sessions[0].sessionId; // Fallback to most recent
                storage.saveActiveSessionId();
            } else {
                 events.handleNewChat(); // Defensive fallback
            }
        }

        // 3. Initialize UI based on loaded state
        ui.updateThemeUI();
        ui.getElement('modelSelector').value = state.currentModel;
        ui.renderSessionList(); // Render session list (attaches its own listeners)

        // Init API Key UI
        if (state.apiKey) {
            ui.getElement('apiKeyInput').value = '********'; ui.getElement('apiKeyInput').type = 'password';
            ui.updateApiStatus("金鑰已載入，點擊 '連線' 測試", "loaded");
            ui.getElement('clearApiKeyButton').style.display = 'block';
            ui.updateChatInputState(false); // Require connect click
        } else {
            ui.updateApiStatus("請輸入金鑰並連線", ""); ui.updateChatInputState(false);
            ui.getElement('clearApiKeyButton').style.display = 'none'; ui.getElement('apiKeyInput').type = 'text';
        }

        // Load active session messages
        if (state.activeSessionId) ui.loadSessionUI(state.activeSessionId);
        else { console.error("Initialization finished but no active session ID is set."); ui.showSystemMessage("錯誤：無法確定要載入哪個聊天。", "init-error", true); }

        ui.adjustTextareaHeight(); // Init textarea height

        // 4. Setup global event listeners AFTER initial rendering is done
        setupEventListeners();

        console.log("Chat initialization complete.");
    }

    // --- Start the Application ---
    initializeChat(); // Run initialization

}); // End of DOMContentLoaded listener
