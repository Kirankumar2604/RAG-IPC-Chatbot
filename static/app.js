document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatMessages = document.getElementById('chat-messages');
    const welcomeContainer = document.getElementById('welcome-container');
    const clearBtn = document.getElementById('clear-btn');
    const kSlider = document.getElementById('k-slider');
    const kValue = document.getElementById('k-value');
    const toggleSidebar = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const toggleSourcesBtn = document.getElementById('toggle-sources');
    const sourcesPanel = document.getElementById('sources-panel');
    const sourcesList = document.getElementById('sources-list');

    // API Key DOM Elements (Sidebar)
    const apiKeyInput = document.getElementById('api-key-input');
    const startServerBtn = document.getElementById('start-server-btn');
    const apiKeyStatus = document.getElementById('api-key-status');
    const sidebarStatusMsg = document.getElementById('sidebar-status-msg');

    // State Variables
    let messageCounter = 0;
    let activeSources = [];
    let openrouterApiKey = localStorage.getItem('openrouter_api_key') || '';
    let isPollingStatus = false;
    let pollInterval = null;

    // API Key & RAG Startup Lifecycle Management
    function updateApiKeyUI(status, message = '', isError = false) {
        if (status === 'ready') {
            apiKeyStatus.textContent = 'Connected';
            apiKeyStatus.className = 'badge badge-accent';
            startServerBtn.textContent = 'Restart Server';
            startServerBtn.disabled = false;
            sidebarStatusMsg.style.display = 'block';
            sidebarStatusMsg.style.color = 'var(--success)';
            sidebarStatusMsg.innerHTML = '✔ RAG Server ready. Chat enabled.';
        } else if (status === 'initializing') {
            apiKeyStatus.textContent = 'Starting...';
            apiKeyStatus.className = 'badge badge-secondary';
            startServerBtn.textContent = 'Initializing...';
            startServerBtn.disabled = true;
            sidebarStatusMsg.style.display = 'block';
            sidebarStatusMsg.style.color = 'var(--accent-gold)';
            sidebarStatusMsg.innerHTML = '⚡ Loading embeddings & index...';
        } else if (status === 'error' || isError) {
            apiKeyStatus.textContent = 'Error';
            apiKeyStatus.className = 'badge';
            startServerBtn.textContent = 'Retry Start';
            startServerBtn.disabled = false;
            sidebarStatusMsg.style.display = 'block';
            sidebarStatusMsg.style.color = 'var(--danger)';
            sidebarStatusMsg.innerHTML = message || '⚠ Startup failed.';
        } else {
            // idle or not set
            if (openrouterApiKey) {
                apiKeyStatus.textContent = 'Configured';
                apiKeyStatus.className = 'badge badge-accent';
            } else {
                apiKeyStatus.textContent = 'Not Set';
                apiKeyStatus.className = 'badge';
            }
            startServerBtn.textContent = 'Start Server';
            startServerBtn.disabled = false;
            sidebarStatusMsg.style.display = 'none';
        }
    }

    // Poll the backend status endpoint
    async function checkServerStatus() {
        try {
            const res = await fetch('/api/status');
            if (!res.ok) {
                updateApiKeyUI('error', 'Status check failed (' + res.status + ')', true);
                return;
            }
            const data = await res.json();
            
            if (data.status === 'ready') {
                stopPolling();
                updateApiKeyUI('ready');
            } else if (data.status === 'initializing') {
                updateApiKeyUI('initializing');
                if (!isPollingStatus) startPolling();
            } else if (data.status === 'error') {
                stopPolling();
                updateApiKeyUI('error', 'Startup failed: ' + data.detail, true);
            } else if (data.status === 'idle') {
                stopPolling();
                updateApiKeyUI('idle');
            }
        } catch (err) {
            console.error('Error checking server status:', err);
            updateApiKeyUI('error', 'Cannot connect to backend server. Make sure it is running on port 8001.', true);
        }
    }

    function startPolling() {
        if (isPollingStatus) return;
        isPollingStatus = true;
        pollInterval = setInterval(checkServerStatus, 1500);
    }

    function stopPolling() {
        if (!isPollingStatus) return;
        isPollingStatus = false;
        clearInterval(pollInterval);
    }

    // Submit key to start the server
    async function startServerWithKey(key) {
        updateApiKeyUI('initializing');

        try {
            const res = await fetch('/api/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Failed to start server');
            }

            // Start polling for status
            startPolling();
        } catch (err) {
            updateApiKeyUI('error', err.message, true);
        }
    }

    // Pre-fill API Key field if it exists
    if (openrouterApiKey) {
        apiKeyInput.value = openrouterApiKey;
    }

    // Hook up start server button click
    startServerBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            alert('Please enter your OpenRouter API Key.');
            return;
        }
        openrouterApiKey = key;
        localStorage.setItem('openrouter_api_key', key);
        startServerWithKey(key);
    });

    // Check status on page load
    checkServerStatus();

    // Sync Slider Value Text
    kSlider.addEventListener('input', (e) => {
        kValue.textContent = e.target.value;
    });

    // Toggle Sidebar on Mobile
    toggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !toggleSidebar.contains(e.target) && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        }
    });

    // Toggle Sources Panel
    toggleSourcesBtn.addEventListener('click', () => {
        sourcesPanel.classList.toggle('collapsed');
        toggleSourcesBtn.classList.toggle('active');
    });

    // Suggested Queries
    const suggestionCards = document.querySelectorAll('.suggestion-card');
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const query = card.getAttribute('data-query');
            userInput.value = query;
            chatForm.dispatchEvent(new Event('submit'));
        });
    });

    // Clear Chat
    clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the conversation?')) {
            // Remove all messages
            const messages = chatMessages.querySelectorAll('.message');
            messages.forEach(m => m.remove());
            // Show welcome container
            welcomeContainer.style.display = 'flex';
            // Clear sources
            resetSourcesPanel();
            // Reset URL/state
            activeSources = [];
        }
    });

    // Format simple Markdown elements into HTML tags
    function formatMarkdown(text) {
        if (!text) return '';
        
        // Escape HTML to prevent injection
        let escaped = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
            
        // Bold tags (**text**)
        escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        let lines = escaped.split('\n');
        let inList = false;
        let inNumList = false;
        let formattedLines = [];
        
        for (let line of lines) {
            let trimmed = line.trim();
            
            // Unordered list (* or -)
            if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                if (!inList) {
                    if (inNumList) {
                        formattedLines.push('</ol>');
                        inNumList = false;
                    }
                    formattedLines.push('<ul>');
                    inList = true;
                }
                formattedLines.push(`<li>${trimmed.substring(2)}</li>`);
            } 
            // Ordered list (digits like 1. or 2.)
            else if (/^\d+\.\s/.test(trimmed)) {
                if (!inNumList) {
                    if (inList) {
                        formattedLines.push('</ul>');
                        inList = false;
                    }
                    formattedLines.push('<ol>');
                    inNumList = true;
                }
                let content = trimmed.replace(/^\d+\.\s/, '');
                formattedLines.push(`<li>${content}</li>`);
            } 
            else {
                // Close lists if open
                if (inList) {
                    formattedLines.push('</ul>');
                    inList = false;
                }
                if (inNumList) {
                    formattedLines.push('</ol>');
                    inNumList = false;
                }
                
                if (trimmed.length > 0) {
                    // Header style detection (ends with colon)
                    if (trimmed.endsWith(':') && trimmed.length < 60) {
                        formattedLines.push(`<h4>${trimmed}</h4>`);
                    } else {
                        formattedLines.push(`<p>${trimmed}</p>`);
                    }
                }
            }
        }
        
        // Final list cleanups
        if (inList) formattedLines.push('</ul>');
        if (inNumList) formattedLines.push('</ol>');
        
        return formattedLines.join('');
    }

    // Reset sources view
    function resetSourcesPanel() {
        sourcesList.innerHTML = `
            <div class="empty-sources">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svg-icon-giant">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No active documents retrieved.</p>
                <span>Submit a query to inspect source legal articles.</span>
            </div>
        `;
    }

    // Scroll chat to bottom
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Copy to clipboard helper
    window.copyToClipboard = function(text, btnId) {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById(btnId);
            const originalText = btn.innerHTML;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon" style="color: var(--success)">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span style="color: var(--success)">Copied!</span>
            `;
            setTimeout(() => {
                btn.innerHTML = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    // Show source documents in right sidebar
    window.showSourcesInSidebar = function(msgIndex) {
        if (!activeSources[msgIndex] || activeSources[msgIndex].length === 0) {
            resetSourcesPanel();
            return;
        }

        // Expand panel if collapsed
        if (sourcesPanel.classList.contains('collapsed')) {
            sourcesPanel.classList.remove('collapsed');
            toggleSourcesBtn.classList.add('active');
        }

        sourcesList.innerHTML = '';
        
        activeSources[msgIndex].forEach((src, idx) => {
            const pageNum = src.metadata.page !== undefined ? (src.metadata.page + 1) : 'Unknown';
            const docName = src.metadata.source ? src.metadata.source.split('/').pop() : 'Indian_Penal_Code.pdf';

            const card = document.createElement('div');
            card.className = `source-card`;
            card.id = `src-${msgIndex}-${idx}`;
            card.innerHTML = `
                <div class="source-header">
                    <span class="source-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="svg-icon" style="width:14px; height:14px">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        ${docName}
                    </span>
                    <span class="badge badge-accent source-page">Page ${pageNum}</span>
                </div>
                <div class="source-text">${src.page_content}</div>
            `;
            sourcesList.appendChild(card);
        });
    };

    // Highlight source card in sidebar
    window.highlightSourceCard = function(msgIndex, srcIdx) {
        // First show sources in sidebar
        showSourcesInSidebar(msgIndex);
        
        // Remove active class from all cards
        document.querySelectorAll('.source-card').forEach(card => {
            card.classList.remove('active-match');
        });

        // Add class to requested card
        const targetCard = document.getElementById(`src-${msgIndex}-${srcIdx}`);
        if (targetCard) {
            targetCard.classList.add('active-match');
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    // Chat submit event
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const questionText = userInput.value.trim();
        if (!questionText) return;

        // Clear input
        userInput.value = '';
        
        // Hide welcome view if visible
        welcomeContainer.style.display = 'none';

        // Increment counter
        const currentMsgIndex = messageCounter++;

        // Append User Message
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'message message-user';
        userMsgDiv.innerHTML = `
            <div class="message-bubble">
                <p>${questionText}</p>
            </div>
            <div class="message-meta">
                <span>You</span>
                <span>•</span>
                <span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `;
        chatMessages.appendChild(userMsgDiv);
        scrollToBottom();

        // Append AI message skeleton loader
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'message message-ai';
        const rawAiMsgId = `ai-msg-${currentMsgIndex}`;
        aiMsgDiv.innerHTML = `
            <div class="message-bubble" id="${rawAiMsgId}">
                <div class="skeleton-container">
                    <div class="skeleton-line skeleton-line-1"></div>
                    <div class="skeleton-line skeleton-line-2"></div>
                    <div class="skeleton-line skeleton-line-3"></div>
                </div>
            </div>
            <div class="message-meta">
                <span>Lexica IPC Assistant</span>
                <span>•</span>
                <span>Typing...</span>
            </div>
        `;
        chatMessages.appendChild(aiMsgDiv);
        scrollToBottom();

        // Prepare request
        const k = parseInt(kSlider.value);
        
        try {
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: questionText,
                    k: k,
                    api_key: openrouterApiKey
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Server error occurred.');
            }

            const data = await response.json();
            
            // Save sources in activeSources list
            activeSources[currentMsgIndex] = data.sources || [];

            // Replace skeleton with structured HTML answer
            const aiBubble = document.getElementById(rawAiMsgId);
            aiBubble.innerHTML = formatMarkdown(data.answer);

            // Update meta-info with citation badge, copy button, etc.
            const metaContainer = aiMsgDiv.querySelector('.message-meta');
            metaContainer.innerHTML = '';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = 'Lexica IPC Assistant';
            metaContainer.appendChild(nameSpan);
            
            metaContainer.appendChild(document.createTextNode(' • '));

            // If sources were retrieved, show badge
            if (data.sources && data.sources.length > 0) {
                const sourceBadge = document.createElement('span');
                sourceBadge.className = 'source-badge';
                sourceBadge.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon" style="width:12px; height:12px">
                        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span>${data.sources.length} Sources</span>
                `;
                sourceBadge.addEventListener('click', () => {
                    showSourcesInSidebar(currentMsgIndex);
                });
                metaContainer.appendChild(sourceBadge);
                metaContainer.appendChild(document.createTextNode(' • '));

                // Auto-show these sources in right sidebar immediately for interactive review
                showSourcesInSidebar(currentMsgIndex);
            }

            const timeSpan = document.createElement('span');
            timeSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            metaContainer.appendChild(timeSpan);

            // Add action links below the bubble (Copy response)
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            
            const copyId = `copy-btn-${currentMsgIndex}`;
            const cleanTextForCopy = data.answer.replace(/\*\*/g, '');
            actionsDiv.innerHTML = `
                <button class="action-btn" id="${copyId}" onclick="copyToClipboard(\`${cleanTextForCopy.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, '${copyId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon" style="width:12px; height:12px">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                    </svg>
                    <span>Copy Answer</span>
                </button>
            `;
            aiMsgDiv.appendChild(actionsDiv);
            scrollToBottom();

        } catch (err) {
            console.error('Error fetching RAG response:', err);
            const aiBubble = document.getElementById(rawAiMsgId);
            aiBubble.innerHTML = `<p style="color: var(--danger)"><strong>Error:</strong> Failed to fetch response from legal server (${err.message})</p>`;
            
            const metaContainer = aiMsgDiv.querySelector('.message-meta');
            metaContainer.innerHTML = `<span>System Error</span> • <span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
            scrollToBottom();
        }
    });
});
