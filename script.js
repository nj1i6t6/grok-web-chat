/**
 * Grok Web Chat - V8 (Refactored with User Requests & Edit Bug Fix - Approach 2: Match Height)
 * + Streaming API Response & max_tokens
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
        apiParameters: { // New section for API parameters
            max_tokens: 8192,
            temperature: 0.7,
            stream: true // Enable streaming by default
        },
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
        },
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
                        // For assistant, content might be initially empty during streaming
                        const rawHtml = marked.parse(content || "", { gfm: true, breaks: true });
                        const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
                        contentContainer.innerHTML = cleanHtml;
                    } catch (e) {
                        console.error("Error rendering assistant message:", e);
                        contentContainer.textContent = content || ""; // Fallback
                        messageDiv.style.border = '1px dashed red';
                    }
                    break;
                default: return null;
            }

            messageDiv.appendChild(contentContainer);

            // Store original raw content for editing
            messageDiv.dataset.originalContent = content;

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
                    li.classList.remove('rename-visible');
                });

                li.appendChild(nameSpan);
                li.appendChild(renameButton);

                li.addEventListener('click', (e) => {
                    if (e.target.closest('.session-rename-button')) return;
                    events.handleSessionSelect(session.sessionId);
                });
                li.addEventListener('mousedown', events.handleSessionPressStart);
                li.addEventListener('mouseup', events.handleSessionPressEnd);
                li.addEventListener('mouseleave', events.handleSessionPressEnd);
                li.addEventListener('touchstart', events.handleSessionPressStart, { passive: true });
                li.addEventListener('touchend', events.handleSessionPressEnd);
                li.addEventListener('touchmove', events.handleSessionPressEnd);

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
            if (state.apiKey) {
                 userInputEl.placeholder = shouldEnable ? "輸入訊息..." : "正在連線或連線失敗，請稍候或檢查金鑰...";
            } else {
                 userInputEl.placeholder = "請先在側邊欄輸入並連線 API...";
            }
             sendButtonEl.title = shouldEnable ? "傳送訊息" : "無法傳送";
        },
        updateThemeUI: () => { ui.getElement('body').classList.toggle('dark-mode', state.currentTheme === 'dark'); const icon = ui.getElement('themeToggleButton').querySelector('i'); icon.className = state.currentTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun'; },
        adjustTextareaHeight: () => { const textarea = ui.getElement('userInput'); const maxHeight = 120; textarea.style.height = 'auto'; const newHeight = Math.min(textarea.scrollHeight, maxHeight); textarea.style.height = `${newHeight}px`; },

        showEditUI: (messageElement, initialContent) => {
            messageElement.classList.add('editing');
            ui.hideAllMessageActions(); 

            const contentContainer = messageElement.querySelector('.message-content');
            if (!contentContainer) return;

            const originalHeight = contentContainer.offsetHeight;
            const rawOriginalContent = messageElement.dataset.originalContent || initialContent;
            messageElement.dataset.editingOriginalHtml = contentContainer.innerHTML;
            contentContainer.innerHTML = '';

            const textarea = document.createElement('textarea');
            textarea.value = rawOriginalContent;
            textarea.classList.add('inline-edit-textarea');
            textarea.rows = 3; 

            const controlsDiv = document.createElement('div');
            controlsDiv.classList.add('inline-edit-controls');
            controlsDiv.innerHTML = `<button class="cancel-edit-button">取消</button><button class="save-edit-button">保存</button>`;
            
            // Improved: Dynamically create and measure controls for more accurate height
            const tempControlsDiv = document.createElement('div');
            tempControlsDiv.classList.add('inline-edit-controls');
            tempControlsDiv.style.position = 'absolute'; tempControlsDiv.style.left = '-9999px'; tempControlsDiv.style.visibility = 'hidden';
            tempControlsDiv.innerHTML = `<button class="cancel-edit-button">取消</button><button class="save-edit-button">保存</button>`;
            document.body.appendChild(tempControlsDiv);
            const actualControlsHeight = tempControlsDiv.offsetHeight + 5; // +5 for margin-bottom on textarea
            document.body.removeChild(tempControlsDiv);

            const targetTextareaMinHeight = Math.max(50, originalHeight - actualControlsHeight);
            textarea.style.minHeight = `${targetTextareaMinHeight}px`;

            contentContainer.appendChild(textarea);
            contentContainer.appendChild(controlsDiv);

            ui.adjustTextareaHeightForEdit(textarea); 
            textarea.focus();
            textarea.select();
        },

        hideEditUI: (messageElement) => {
             if (!messageElement || !messageElement.classList.contains('editing')) return;
             const contentContainer = messageElement.querySelector('.message-content');
             if (contentContainer && messageElement.dataset.editingOriginalHtml) {
                 contentContainer.innerHTML = messageElement.dataset.editingOriginalHtml;
             } else if (contentContainer && messageElement.dataset.originalContent) {
                  const originalRaw = messageElement.dataset.originalContent;
                  const role = messageElement.classList.contains('user-message') ? 'user' : 'assistant';
                  if (role === 'user') {
                      contentContainer.textContent = originalRaw;
                  } else {
                      try {
                          const rawHtml = marked.parse(originalRaw, { gfm: true, breaks: true });
                          contentContainer.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
                      } catch (e) {
                          contentContainer.textContent = originalRaw;
                      }
                  }
             } else {
                 console.warn("Could not restore original content for message:", messageElement.dataset.id);
                 if (contentContainer) contentContainer.innerHTML = '[恢復內容失敗]';
             }
             messageElement.classList.remove('editing');
             delete messageElement.dataset.editingOriginalHtml;
        },
        hideAllMessageActions: () => { document.querySelectorAll('.message.actions-visible').forEach(el => { if (!el.classList.contains('editing')) el.classList.remove('actions-visible'); }); },

        adjustTextareaHeightForEdit: (textarea) => {
            const maxHeight = 400; 
            const computedMinHeight = parseInt(window.getComputedStyle(textarea).minHeight, 10) || 0;
            textarea.style.height = 'auto'; 
            const scrollHeight = textarea.scrollHeight;
            const newHeight = Math.min(maxHeight, Math.max(computedMinHeight, scrollHeight));
            textarea.style.height = `${newHeight}px`;
            textarea.style.overflowY = (scrollHeight > maxHeight || newHeight >= maxHeight) ? 'auto' : 'hidden'; 
        },

        closeSidebarIfMobile: () => { if (window.innerWidth <= 768) events.handleCloseSidebar(); },
        hideAllRenameButtons: () => { document.querySelectorAll('#chat-session-list li.rename-visible').forEach(item => item.classList.remove('rename-visible')); }
    };

    // --- API Module (Backend Communication) ---
    const api = {
        testApiKey: async (keyToTest) => {
             console.log("Testing API Key...");
             try {
                 const response = await fetch(config.apiUrls.models, { method: 'GET', headers: { 'Authorization': `Bearer ${keyToTest}` } });
                 if (response.ok) {
                     console.log("API Key Test: Success");
                     return true;
                 } else {
                     let errorMsg = `連線失敗 (${response.status})`;
                     try {
                         const errorData = await response.json();
                         errorMsg += `: ${errorData.error?.message || errorData.error || JSON.stringify(errorData)}`;
                     } catch(e) {
                         errorMsg += `: ${response.statusText}`;
                     }
                     ui.updateApiStatus(errorMsg, "error");
                     console.error("API Key validation failed:", errorMsg);
                     return false;
                 }
             } catch (error) {
                 ui.updateApiStatus(`網路錯誤: ${error.message}`, "error");
                 console.error("Error testing API key:", error);
                 return false;
             }
         },
        callGrokApi: async () => {
            const userInputEl = ui.getElement('userInput');
            const userText = userInputEl.value.trim();
            if (!userText || state.isLoading) return;

            if (!state.apiKey) {
                ui.showSystemMessage('請先在側邊欄連線 API 金鑰。', `error-no-api-${logic.generateMessageId()}`, true);
                events.handleSidebarToggle(true);
                return;
            }
            if (!state.activeSessionId) {
                ui.showSystemMessage('錯誤：沒有活動的聊天會話。請嘗試新增或選擇一個聊天。', `error-no-session-${logic.generateMessageId()}`, true);
                return;
            }

            state.isLoading = true;
            ui.updateChatInputState(false);

            const userMessageId = logic.generateMessageId();
            const userMessage = { role: 'user', content: userText, id: userMessageId, timestamp: Date.now() };
            logic.addMessageToCurrentSession(userMessage);
            const newMessageElement = ui.renderMessage(userMessage);
            if (newMessageElement) ui.getElement('chatMessages').appendChild(newMessageElement);

            ui.scrollToBottom();
            userInputEl.value = '';
            ui.adjustTextareaHeight();

            const loadingId = `loading-${userMessageId}`;
            ui.showLoadingIndicator(loadingId);

            try {
                const currentSessionMessages = logic.getCurrentSessionMessages();
                // Ensure we don't send system messages or messages without content if any slip through
                const messagesToSend = currentSessionMessages
                    .filter(msg => ['user', 'assistant'].includes(msg.role) && typeof msg.content === 'string')
                    .map(({ role, content }) => ({ role, content }));

                const requestBody = {
                    messages: messagesToSend,
                    model: state.currentModel,
                    stream: config.apiParameters.stream,
                    temperature: config.apiParameters.temperature,
                    max_tokens: config.apiParameters.max_tokens
                };

                const response = await fetch(config.apiUrls.chat, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.apiKey}` },
                    body: JSON.stringify(requestBody)
                });

                ui.removeElementById(loadingId); // Remove loading indicator once response headers are received

                if (response.ok && requestBody.stream) {
                    const assistantMessageId = logic.generateMessageId();
                    let accumulatedContent = '';
                    const assistantMessageData = {
                        role: 'assistant',
                        content: accumulatedContent, // Start empty
                        id: assistantMessageId,
                        timestamp: Date.now()
                    };

                    logic.addMessageToCurrentSession(assistantMessageData); // Add to state immediately

                    const assistantMessageElement = ui.renderMessage(assistantMessageData);
                    if (assistantMessageElement) {
                        ui.getElement('chatMessages').appendChild(assistantMessageElement);
                        ui.scrollToBottom();
                    } else {
                        console.error("Could not render initial assistant message bubble for streaming.");
                        // This is a critical UI failure, reset state and allow user to try again
                        state.isLoading = false;
                        ui.updateChatInputState(true);
                        userInputEl.focus();
                        return;
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = ''; // Buffer for incomplete SSE lines

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                console.log("Stream finished by reader 'done'.");
                                break;
                            }

                            buffer += decoder.decode(value, { stream: true });
                            let eolIndex;

                            while ((eolIndex = buffer.indexOf('\n')) >= 0) {
                                const line = buffer.substring(0, eolIndex).trim();
                                buffer = buffer.substring(eolIndex + 1);

                                if (line.startsWith('data: ')) {
                                    const jsonData = line.substring(6);
                                    if (jsonData.trim().toLowerCase() === '[done]') { // Grok might use lowercase [done]
                                        console.log("Stream signaled [DONE].");
                                        // Continue to rely on reader.done for actual stream end
                                        continue;
                                    }
                                    try {
                                        const parsedData = JSON.parse(jsonData);
                                        let chunkContent = "";
                                        let finishReason = null;

                                        if (parsedData.choices && parsedData.choices[0]) {
                                            if (parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
                                                chunkContent = parsedData.choices[0].delta.content;
                                            }
                                            if (parsedData.choices[0].finish_reason) {
                                                finishReason = parsedData.choices[0].finish_reason;
                                                console.log("Stream finished with reason:", finishReason);
                                            }
                                        } else if (parsedData.error) {
                                            console.error("Error message in stream:", parsedData.error);
                                            const errorContent = `API Stream Error: ${parsedData.error.message || JSON.stringify(parsedData.error)}`;
                                            accumulatedContent += `\n\n--- Stream Error: ${errorContent} ---`; // Append error to message
                                            assistantMessageData.content = accumulatedContent; // Update state
                                            // No need to throw, let the stream complete if possible, error is now part of the message
                                        }


                                        if (chunkContent) {
                                            accumulatedContent += chunkContent;
                                            assistantMessageData.content = accumulatedContent; // Update the object in session.messages

                                            if (assistantMessageElement) {
                                                const contentContainer = assistantMessageElement.querySelector('.message-content');
                                                if (contentContainer) {
                                                    const rawHtml = marked.parse(accumulatedContent, { gfm: true, breaks: true });
                                                    contentContainer.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
                                                    assistantMessageElement.dataset.originalContent = accumulatedContent;
                                                    ui.scrollToBottom();
                                                }
                                            }
                                        }
                                        if (finishReason) {
                                            // If there's a finish reason, we can consider the stream effectively ended here for this choice.
                                            // The outer `while(true)` loop with `reader.read()` will still wait for `done:true`.
                                        }
                                    } catch (e) {
                                        console.error('Error processing stream data line:', `"${jsonData}"`, e);
                                    }
                                }
                            }
                        }
                    } catch (streamError) {
                        console.error('Error reading from stream:', streamError);
                        ui.showSystemMessage(`讀取 AI 回應流時發生錯誤: ${streamError.message}`, `error-read-stream-${assistantMessageId}`, true);
                        assistantMessageData.content = accumulatedContent + `\n\n--- Error reading stream: ${streamError.message} ---`; // Append error to message
                    } finally {
                        // Update the actual message content in the state object, then save
                        assistantMessageData.content = accumulatedContent; // Ensure final content is set
                        storage.saveSessions(); // Save the session with the complete or partial streamed message.
                        // Reset loading state after stream processing is fully complete (success or error)
                        state.isLoading = false;
                        ui.updateChatInputState(true);
                        userInputEl.focus();
                    }

                } else if (response.ok) { // Non-streaming response (fallback)
                    const data = await response.json();
                    if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
                        const assistantReply = data.choices[0].message.content.trim();
                        const assistantMessageId = logic.generateMessageId();
                        const assistantMessage = { role: 'assistant', content: assistantReply, id: assistantMessageId, timestamp: Date.now() };
                        logic.addMessageToCurrentSession(assistantMessage);
                        const newAssistantMsgElement = ui.renderMessage(assistantMessage);
                        if (newAssistantMsgElement) ui.getElement('chatMessages').appendChild(newAssistantMsgElement);
                        ui.scrollToBottom();
                    } else {
                        console.error('Invalid API response structure (non-streaming):', data);
                        ui.showSystemMessage('收到無效的 API 回應格式。', `error-api-format-${logic.generateMessageId()}`, true);
                    }
                    state.isLoading = false;
                    ui.updateChatInputState(true);
                    userInputEl.focus();
                } else { // Handle !response.ok (for both streaming and non-streaming attempts)
                    let errorText = await response.text();
                    let errorMessage = `API 請求失敗 (${response.status} ${response.statusText})`;
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorMessage += `: ${errorJson.error?.message || errorJson.error || JSON.stringify(errorJson)}`;
                    } catch (e) { errorMessage += `\n回應: ${errorText}`; }

                    if (response.status === 401 || response.status === 403) {
                        errorMessage += " 金鑰可能已失效或無效，請檢查並重新連線。";
                        logic.clearApiKey(false); // Don't confirm, just clear and notify
                    }
                    console.error('API Error:', errorMessage);
                    ui.showSystemMessage(errorMessage, `error-api-${logic.generateMessageId()}`, true);
                    state.isLoading = false;
                    ui.updateChatInputState(true);
                    userInputEl.focus();
                }
            } catch (error) { // Catches errors from fetch itself, or client-side pre-API call errors
                console.error('Error calling Grok API or client-side pre-API error:', error);
                ui.removeElementById(loadingId); // Ensure loading indicator is removed
                // Avoid double-reporting generic network if specific API error was handled above
                if (!String(error.message).includes('API 請求失敗')) {
                    ui.showSystemMessage(`客戶端網路或處理錯誤: ${error.message}`, `error-client-${logic.generateMessageId()}`, true);
                }
                state.isLoading = false;
                ui.updateChatInputState(true);
                userInputEl.focus();
            }
        }
    };

     // --- Logic / Business Rules ---
     const logic = {
        generateSessionId: () => `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        generateMessageId: () => `msg-${state.messageIdCounter++}`,
        getCurrentSession: () => state.sessions.find(s => s.sessionId === state.activeSessionId),
        getCurrentSessionMessages: () => logic.getCurrentSession()?.messages || [],
        addMessageToCurrentSession: (message) => {
            const session = logic.getCurrentSession();
            if (session) {
                if (!message.id) {
                    message.id = logic.generateMessageId();
                    console.warn("Message added without ID, generated:", message.id);
                }
                session.messages.push(message);
                // For streaming, saveSessions will be called after the stream is complete
                // For non-streaming messages (like user messages), save immediately
                if (message.role === 'user' || !config.apiParameters.stream) { // Save if user message or if not streaming assistant
                    storage.saveSessions();
                }
            } else {
                console.error("Cannot add message: No active session found.");
                ui.showSystemMessage("錯誤：無法將訊息添加到當前聊天中，找不到活動會話。", `error-add-msg-${Date.now()}`, true);
            }
        },
        updateMessageInSession: (sessionId, messageId, newContent) => {
            const session = state.sessions.find(s => s.sessionId === sessionId);
            const messageIndex = session?.messages.findIndex(msg => msg.id === messageId);
            if (session && messageIndex !== undefined && messageIndex > -1) {
                session.messages[messageIndex].content = newContent;
                session.messages[messageIndex].edited = true; // Mark as edited
                session.messages[messageIndex].lastUpdatedAt = Date.now(); // Update timestamp
                storage.saveSessions(); // Save after an edit
                return true;
            }
            console.error(`Failed to update message: session ${sessionId}, message ${messageId}`);
            return false;
        },
        deleteMessageFromSession: (sessionId, messageId) => { const session = state.sessions.find(s => s.sessionId === sessionId); const messageIndex = session?.messages.findIndex(msg => msg.id === messageId); if (session && messageIndex !== undefined && messageIndex > -1) { session.messages.splice(messageIndex, 1); storage.saveSessions(); return true; } console.error(`Failed to delete message: session ${sessionId}, message ${messageId}`); return false; },
        deleteSession: (sessionId) => { const sessionIndex = state.sessions.findIndex(s => s.sessionId === sessionId); if (sessionIndex > -1) { state.sessions.splice(sessionIndex, 1); storage.saveSessions(); return true; } console.error(`Failed to delete session: ${sessionId}`); return false; },
        renameSession: (sessionId, newName) => { const session = state.sessions.find(s => s.sessionId === sessionId); const trimmedName = newName?.trim(); if (session && trimmedName) { session.name = trimmedName; storage.saveSessions(); return true; } console.warn(`Failed to rename session ${sessionId} to "${newName}" (name empty or session not found)`); return false; },
        clearApiKey: (confirmUser = true) => {
            const doClear = !confirmUser || confirm("確定要清除已儲存的 API 金鑰嗎？您需要重新輸入才能使用。");
            if (doClear) {
                state.apiKey = null;
                storage.removeApiKey();
                ui.getElement('apiKeyInput').value = '';
                ui.getElement('apiKeyInput').type = 'text'; // Show input as text
                ui.updateApiStatus("金鑰已清除，請重新輸入並連線", "");
                ui.updateChatInputState(false);
                ui.getElement('clearApiKeyButton').style.display = 'none';
                console.log("API Key cleared.");
                return true;
            }
            return false;
        }
     };

    // --- Event Handling Module ---
    const events = {
        handleApiKeyConnection: () => {
            const inputKey = ui.getElement('apiKeyInput').value.trim();
            if (!inputKey) { ui.updateApiStatus("請輸入 API 金鑰", "error"); return; }
            if (state.isLoading) return;

            state.isLoading = true;
            ui.updateApiStatus("正在測試連線...", "testing");
            ui.getElement('connectApiButton').disabled = true;
            ui.getElement('apiKeyInput').disabled = true;
            ui.getElement('clearApiKeyButton').disabled = true;

            api.testApiKey(inputKey).then(isValid => {
                if (isValid) {
                    state.apiKey = inputKey;
                    storage.saveApiKey();
                    ui.updateApiStatus("連線成功！", "success");
                    ui.updateChatInputState(true);
                    ui.getElement('clearApiKeyButton').style.display = 'block';
                    ui.getElement('apiKeyInput').value = '********'; // Mask key
                    ui.getElement('apiKeyInput').type = 'password';
                    ui.closeSidebarIfMobile();
                } else {
                    // API status already updated by testApiKey on failure
                    state.apiKey = null; // Ensure state is cleared
                    storage.removeApiKey();
                    ui.updateChatInputState(false);
                    ui.getElement('clearApiKeyButton').style.display = 'none';
                    ui.getElement('apiKeyInput').type = 'text'; // Ensure it's text if it failed
                }
            }).catch(err => { // Catch errors from testApiKey promise itself
                console.error("Error during API key connection:", err);
                ui.updateApiStatus(`連線測試時發生錯誤: ${err.message}`, "error");
                state.apiKey = null;
                storage.removeApiKey();
                ui.updateChatInputState(false);
                ui.getElement('clearApiKeyButton').style.display = 'none';
                ui.getElement('apiKeyInput').type = 'text';
            }).finally(() => {
                state.isLoading = false;
                ui.getElement('connectApiButton').disabled = false;
                ui.getElement('apiKeyInput').disabled = false;
                ui.getElement('clearApiKeyButton').disabled = false;
            });
        },
        handleClearApiKey: () => { if (logic.clearApiKey(true)) { ui.closeSidebarIfMobile(); } },
        handleNewChat: () => {
            if (state.currentEditingMessageId) { if (!confirm("您正在編輯訊息，新增聊天將丟失未保存的更改。確定要繼續嗎？")) { return; } events.handleCancelEdit(state.currentEditingMessageId, true); } 
            const now = Date.now(); const newSession = { sessionId: logic.generateSessionId(), name: `新聊天 ${new Date(now).toLocaleTimeString('zh-TW', { hour12: false })}`, messages: [], createdAt: now, lastUpdatedAt: now };
            state.sessions.unshift(newSession); state.activeSessionId = newSession.sessionId;
            storage.saveSessions(); ui.renderSessionList(); ui.loadSessionUI(newSession.sessionId);
            ui.closeSidebarIfMobile(); ui.getElement('userInput').focus();
        },
        handleSessionSelect: (sessionId) => {
             if (state.currentEditingMessageId) {
                 const messageElement = document.querySelector(`.message[data-id="${state.currentEditingMessageId}"]`);
                 const editTextArea = messageElement?.querySelector('.message-content textarea.inline-edit-textarea');
                 const originalContent = messageElement?.dataset?.originalContent;
                 if (editTextArea && originalContent && editTextArea.value !== originalContent) {
                     if (!confirm("您正在編輯訊息，切換聊天將丟失未保存的更改。確定要切換嗎？")) {
                         return;
                     }
                 }
                 events.handleCancelEdit(state.currentEditingMessageId, true); 
             }
            if (sessionId !== state.activeSessionId) { ui.loadSessionUI(sessionId); }
             ui.closeSidebarIfMobile();
             ui.hideAllRenameButtons();
        },
        handleSessionRename: (sessionId) => {
            const session = state.sessions.find(s => s.sessionId === sessionId); if (!session) return;
            const currentName = session.name || `聊天 ${sessionId.slice(-4)}`; const newName = prompt("請輸入新的聊天名稱：", currentName);
            if (newName !== null) { if (logic.renameSession(sessionId, newName)) { ui.renderSessionList(); if (sessionId === state.activeSessionId) ui.getElement('mobileChatTitle').textContent = newName.trim() || `聊天 ${sessionId.slice(-4)}`; } else if (!newName || !newName.trim()){ alert("聊天名稱不能為空！"); } }
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
                if (state.currentEditingMessageId && state.activeSessionId === logic.getCurrentSession()?.sessionId) {
                    events.handleCancelEdit(state.currentEditingMessageId, true); 
                }
                const sessionIndex = state.sessions.findIndex(s => s.sessionId === state.activeSessionId);
                if (logic.deleteSession(state.activeSessionId)) {
                    let nextSessionId = null;
                    if (state.sessions.length > 0) {
                        const nextIndex = Math.max(0, sessionIndex - 1);
                        nextSessionId = state.sessions[nextIndex]?.sessionId;
                    }
                    ui.renderSessionList();
                    if (nextSessionId) {
                        ui.loadSessionUI(nextSessionId);
                    } else {
                        events.handleNewChat(); 
                    }
                }
            }
            ui.closeSidebarIfMobile();
        },
        handleThemeToggle: () => { state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light'; storage.saveTheme(); ui.updateThemeUI(); ui.closeSidebarIfMobile(); },
        handleSendMessage: () => { api.callGrokApi(); },
        handleModelChange: () => { state.currentModel = ui.getElement('modelSelector').value; storage.saveModel(); ui.showSystemMessage(`模型已切換至: ${state.currentModel}`, `system-model-${logic.generateMessageId()}`); ui.closeSidebarIfMobile(); },
        handleSidebarToggle: (forceOpen = false) => { const body = ui.getElement('body'); if (forceOpen) body.classList.add('sidebar-open'); else body.classList.toggle('sidebar-open'); },
        handleCloseSidebar: () => { ui.getElement('body').classList.remove('sidebar-open'); },
        handleTextareaInput: () => { ui.adjustTextareaHeight(); },
        handleTextareaKeydown: (event) => { /* Enter key functionality removed */ },
        handleMessageActions: (event) => {
            const target = event.target;
            const messageElement = target.closest('.message[data-id]');

            if (!target.closest('.message') && !target.closest('.sidebar') && !target.closest('.mobile-header')) {
                if (state.currentEditingMessageId) {
                    const currentMessageElement = document.querySelector(`.message[data-id="${state.currentEditingMessageId}"]`);
                    const editTextArea = currentMessageElement?.querySelector('.message-content textarea.inline-edit-textarea');
                    const originalContent = currentMessageElement?.dataset?.originalContent;
                    if (editTextArea && originalContent && editTextArea.value !== originalContent) {
                         if (!confirm("您正在編輯訊息，點擊其他地方將丟失未保存的更改。確定要取消編輯嗎？")) {
                             return;
                         }
                    }
                    events.handleCancelEdit(state.currentEditingMessageId, true); 
                }
                ui.hideAllMessageActions();
                return;
            }

            if (!messageElement) return;
            const messageId = messageElement.dataset.id;

            if (messageElement.classList.contains('editing')) {
                 const saveButton = target.closest('.inline-edit-controls .save-edit-button');
                 const cancelButton = target.closest('.inline-edit-controls .cancel-edit-button');
                 if (saveButton) events.handleSaveEdit(messageId, messageElement);
                 else if (cancelButton) events.handleCancelEdit(messageId);
                 return;
            }

            if (state.currentEditingMessageId && state.currentEditingMessageId !== messageId) {
                const currentMessageElement = document.querySelector(`.message[data-id="${state.currentEditingMessageId}"]`);
                const editTextArea = currentMessageElement?.querySelector('.message-content textarea.inline-edit-textarea');
                const originalContent = currentMessageElement?.dataset?.originalContent;
                 if (editTextArea && originalContent && editTextArea.value !== originalContent) {
                     if (!confirm("您正在編輯另一則訊息，點擊此處將丟失未保存的更改。確定要取消編輯嗎？")) {
                         return;
                     }
                 }
                events.handleCancelEdit(state.currentEditingMessageId, true); 
            }

            const actionButton = target.closest('.message-actions .action-button');
            if (actionButton) {
                 const messageData = logic.getCurrentSession()?.messages.find(msg => msg.id === messageId);
                 if (!messageData) return;

                 if (actionButton.classList.contains('action-copy')) {
                     events.handleCopyMessage(messageElement.dataset.originalContent || messageData.content, actionButton);
                 } else if (actionButton.classList.contains('action-delete')) {
                     events.handleDeleteMessage(messageId, messageElement);
                 } else if (actionButton.classList.contains('action-edit')) {
                     events.handleStartEdit(messageElement, messageElement.dataset.originalContent || messageData.content);
                 }
                 event.stopPropagation();
                 return;
             }

            if (!target.closest('.message-actions') && !target.closest('.message-content')) {
                 const currentlyVisible = document.querySelector('.message.actions-visible');
                 if (currentlyVisible && currentlyVisible !== messageElement) {
                     currentlyVisible.classList.remove('actions-visible');
                 }
                 messageElement.classList.toggle('actions-visible');
                 event.stopPropagation();
            }
        },
        handleCopyMessage: (content, buttonElement) => { if (!content) return; navigator.clipboard.writeText(content).then(() => { const originalIcon = buttonElement.innerHTML; buttonElement.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { if(buttonElement) buttonElement.innerHTML = originalIcon; }, 1000); }).catch(err => { console.error('Failed to copy message:', err); alert('複製失敗！可能是瀏覽器不支援或未授予權限。'); }); },
        handleDeleteMessage: (messageId, messageElement) => { if (confirm('確定要刪除此訊息嗎？')) { if (logic.deleteMessageFromSession(state.activeSessionId, messageId)) messageElement.remove(); } },
        handleStartEdit: (messageElement, rawContent) => {
            const messageId = messageElement.dataset.id;
            if (!messageId) return;

            if (state.currentEditingMessageId && state.currentEditingMessageId !== messageId) {
                 const currentMessageElement = document.querySelector(`.message[data-id="${state.currentEditingMessageId}"]`);
                 const editTextArea = currentMessageElement?.querySelector('.message-content textarea.inline-edit-textarea');
                 const originalContent = currentMessageElement?.dataset?.originalContent;
                if (editTextArea && originalContent && editTextArea.value !== originalContent) {
                     if (!confirm("您正在編輯另一則訊息，開始編輯此訊息將丟失未保存的更改。確定要取消編輯嗎？")) {
                         return;
                     }
                 }
                events.handleCancelEdit(state.currentEditingMessageId, true); 
            }
            state.currentEditingMessageId = messageId;
            ui.showEditUI(messageElement, rawContent);
        },
        handleSaveEdit: (messageId, messageElement) => {
            const contentContainer = messageElement.querySelector('.message-content');
            const textarea = contentContainer?.querySelector('textarea.inline-edit-textarea');

            if (!textarea || !contentContainer) {
                 console.warn("SaveEdit: Textarea or Content Container not found for message", messageId);
                 if (messageElement) ui.hideEditUI(messageElement);
                 if (state.currentEditingMessageId === messageId) state.currentEditingMessageId = null;
                 return;
            }

            const newContent = textarea.value;
            const originalMessageData = logic.getCurrentSession()?.messages.find(msg => msg.id === messageId);
            const originalRawContent = messageElement.dataset.originalContent; // Raw content before this edit started

            if (!originalMessageData) {
                 console.error("SaveEdit: Original message data not found for ID:", messageId);
                 ui.hideEditUI(messageElement);
                 state.currentEditingMessageId = null;
                 alert("儲存編輯時發生錯誤：找不到原始訊息數據。");
                 return;
            }

            if (newContent !== originalRawContent) {
                 if (newContent.trim() === "") {
                     alert("訊息內容不能為空！");
                     textarea.focus();
                     return;
                 }

                if (logic.updateMessageInSession(state.activeSessionId, messageId, newContent)) {
                    // Update the dataset.originalContent to the new saved content
                    messageElement.dataset.originalContent = newContent;

                    // Re-render the content display (already done by logic.updateMessageInSession's save & potential list re-render, but ensure specific element is updated)
                    if (originalMessageData.role === 'user') {
                         contentContainer.textContent = newContent;
                    } else if (originalMessageData.role === 'assistant') {
                         try {
                             const rawHtml = marked.parse(newContent, { gfm: true, breaks: true });
                             contentContainer.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
                         } catch (e) {
                             console.error("Error re-rendering edited assistant message:", e);
                             contentContainer.textContent = newContent; // Fallback
                         }
                    }
                     messageElement.dataset.editingOriginalHtml = contentContainer.innerHTML; // Update for subsequent cancels

                    let editedIndicator = messageElement.querySelector('.edited-indicator');
                     if (!editedIndicator) {
                         const actionsContainer = messageElement.querySelector('.message-actions');
                         if (actionsContainer) {
                             actionsContainer.insertAdjacentHTML('beforeend', '<span class="edited-indicator" title="已編輯"><i class="fas fa-history"></i></span>');
                         }
                     }
                     ui.hideEditUI(messageElement); // Call this after updates
                     state.currentEditingMessageId = null;
                 } else {
                     alert("儲存編輯失敗！請稍後再試。");
                 }
            } else { // Content hasn't changed
                 ui.hideEditUI(messageElement);
                 state.currentEditingMessageId = null;
            }
        },
        handleCancelEdit: (messageId, force = false) => {
            const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
            if (messageElement && messageElement.classList.contains('editing')) {
                let confirmed = force;
                if (!force) {
                    const editTextArea = messageElement.querySelector('.message-content textarea.inline-edit-textarea');
                    const originalContent = messageElement.dataset.originalContent;
                    if (editTextArea && originalContent && editTextArea.value !== originalContent) {
                        confirmed = confirm("您尚未保存更改，確定要取消編輯嗎？");
                    } else {
                        confirmed = true;
                    }
                }

                 if (confirmed) {
                     ui.hideEditUI(messageElement);
                     if (state.currentEditingMessageId === messageId) {
                         state.currentEditingMessageId = null;
                     }
                 }
             } else if (state.currentEditingMessageId === messageId) { // Ensure state is cleared if element not found but ID matches
                 state.currentEditingMessageId = null;
             }
        },

        handleSessionPressStart: (event) => {
            const targetLi = event.target.closest('.session-item');
            if (!targetLi) return;
            clearTimeout(longPressTimer);
            longPressTargetElement = targetLi;
            longPressTimer = setTimeout(() => {
                if (longPressTargetElement === targetLi) { ui.hideAllRenameButtons(); targetLi.classList.add('rename-visible'); }
                longPressTimer = null;
            }, LONG_PRESS_DURATION);
        },
        handleSessionPressEnd: (event) => { clearTimeout(longPressTimer); longPressTimer = null; longPressTargetElement = null; },
        handleDocumentClickForHideRename: (event) => {
            const clickedRenameButton = event.target.closest('.session-rename-button');
            const clickedListItem = event.target.closest('.session-item');
            if (!clickedListItem || (clickedListItem && !clickedRenameButton)) { ui.hideAllRenameButtons(); }
        }
    };

    // --- Event Listener Setup ---
    function setupEventListeners() {
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

        ui.getElement('chatMessages').addEventListener('click', events.handleMessageActions);

        document.addEventListener('mousedown', events.handleDocumentClickForHideRename, true);
        document.addEventListener('touchstart', events.handleDocumentClickForHideRename, true);
        document.addEventListener('click', events.handleMessageActions, true); 
    }

    // --- App Initialization Function ---
    function initializeChat() {
        console.log("Initializing chat...");
        state.currentTheme = storage.loadTheme();
        state.apiKey = storage.loadApiKey();
        state.currentModel = storage.loadModel();

        const sessionsLoaded = storage.loadSessions();
        if (!sessionsLoaded || state.sessions.length === 0) {
            events.handleNewChat(); 
        } else {
            const lastActiveId = storage.loadActiveSessionId();
            if (lastActiveId && state.sessions.some(s => s.sessionId === lastActiveId)) {
                state.activeSessionId = lastActiveId;
            } else if (state.sessions.length > 0) {
                state.activeSessionId = state.sessions[0].sessionId; 
                storage.saveActiveSessionId();
            } else {
                 events.handleNewChat(); 
            }
        }

        ui.updateThemeUI();
        ui.getElement('modelSelector').value = state.currentModel;
        ui.renderSessionList();

        if (state.apiKey) {
            ui.getElement('apiKeyInput').value = '********';
            ui.getElement('apiKeyInput').type = 'password';
            ui.getElement('clearApiKeyButton').style.display = 'block';
            ui.updateChatInputState(false); 
            ui.getElement('connectApiButton').disabled = true;
            ui.getElement('apiKeyInput').disabled = true;
            ui.updateApiStatus("正在自動測試金鑰...", "testing");

            api.testApiKey(state.apiKey).then(isValid => {
                if (isValid) {
                    ui.updateApiStatus("金鑰自動連線成功！", "success");
                    ui.updateChatInputState(true);
                } else {
                    // API status already updated by testApiKey
                    state.apiKey = null; storage.removeApiKey();
                    ui.getElement('apiKeyInput').value = ''; 
                    ui.getElement('apiKeyInput').type = 'text';
                    ui.getElement('clearApiKeyButton').style.display = 'none';
                    // ui.updateApiStatus("自動連線失敗，請檢查或重新輸入金鑰。", "error"); // Already handled
                    ui.updateChatInputState(false);
                }
            }).catch(err => {
                console.error("Error during auto-connection sequence:", err);
                ui.updateApiStatus("自動連線時發生錯誤。", "error");
                state.apiKey = null; storage.removeApiKey();
                ui.getElement('apiKeyInput').value = '';
                ui.getElement('apiKeyInput').type = 'text';
                ui.getElement('clearApiKeyButton').style.display = 'none';
                ui.updateChatInputState(false);
            }).finally(() => {
                // Enable buttons regardless of auto-connect outcome if it wasn't a state.isLoading issue
                if (!state.isLoading) { // isLoading might be true if user clicks connect while auto is running
                    ui.getElement('connectApiButton').disabled = false;
                    ui.getElement('apiKeyInput').disabled = false;
                }
            });
        } else {
            ui.updateApiStatus("請輸入金鑰並連線", "");
            ui.updateChatInputState(false);
            ui.getElement('clearApiKeyButton').style.display = 'none';
            ui.getElement('apiKeyInput').type = 'text';
        }

        if (state.activeSessionId) ui.loadSessionUI(state.activeSessionId);
        else { console.error("Initialization finished but no active session ID is set."); ui.showSystemMessage("錯誤：無法確定要載入哪個聊天。", "init-error", true); }

        ui.adjustTextareaHeight();
        setupEventListeners();
        console.log("Chat initialization complete.");
    }

    // --- Start the Application ---
    initializeChat();

}); // End of DOMContentLoaded listener
