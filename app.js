document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const connectBtn = document.getElementById('connectBtn');
  const targetLangSelect = document.getElementById('targetLang');
  const micBtn = document.getElementById('micBtn');
  const statusText = document.getElementById('statusText');
  const sourceLog = document.getElementById('sourceLog');
  const targetLog = document.getElementById('targetLog');
  const historySidebar = document.getElementById('historySidebar');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const historyList = document.getElementById('historyList');

  // Load saved API key from localStorage
  const savedApiKey = localStorage.getItem('gemini_api_key');
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
  }

  window.addEventListener('error', function(e) {
    statusText.textContent = "Error: " + e.message;
    statusText.style.color = "red";
  });

  let liveApi = null;
  let audioStreamer = null;
  let audioPlayer = null;
  
  let isConnected = false;
  let isRecording = false;
  
  let currentSourceBubble = null;
  let currentTargetBubble = null;

  connectBtn.addEventListener('click', toggleConnection);
  micBtn.addEventListener('click', toggleRecording);

  function toggleConnection() {
    console.log("Toggle connection called. isConnected:", isConnected);
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  }

  function connect() {
    console.log("Connect function started");
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      alert("Please enter a Gemini API Key");
      return;
    }
    
    // Save the API key to localStorage
    localStorage.setItem('gemini_api_key', apiKey);

    const targetLang = targetLangSelect.value;
    const sourceLang = document.getElementById('sourceLang').value;
    console.log("Source language:", sourceLang, "Target language:", targetLang);

    statusText.textContent = "Connecting...";
    statusText.style.color = ""; // reset color
    apiKeyInput.disabled = true;
    targetLangSelect.disabled = true;
    document.getElementById('sourceLang').disabled = true;
    connectBtn.disabled = true;

    try {
      console.log("Checking if AudioPlayer exists");
      if (typeof AudioPlayer === 'undefined') {
        throw new Error("AudioPlayer class is not defined. audio-handler.js might not be loaded.");
      }
      
      // Initialize audio player on user gesture
      if (!audioPlayer) {
        audioPlayer = new AudioPlayer();
        console.log("AudioPlayer initialized");
      }

      console.log("Checking if LiveAPI exists");
      if (typeof LiveAPI === 'undefined') {
        throw new Error("LiveAPI class is not defined. live-api.js might not be loaded.");
      }

      console.log("Creating new LiveAPI instance");
      liveApi = new LiveAPI({
      apiKey: apiKey,
      sourceLang: sourceLang,
      targetLang: targetLang,
      onConnected: () => {
        isConnected = true;
        statusText.textContent = "Connected";
        statusText.classList.add("connected");
        connectBtn.textContent = "Disconnect";
        connectBtn.disabled = false;
        micBtn.disabled = false;
        
        // Ensure AudioContext is resumed
        if (audioPlayer && audioPlayer.audioContext.state === 'suspended') {
          audioPlayer.audioContext.resume();
        }
      },
      onDisconnected: () => {
        handleDisconnect();
      },
      onAudioReceived: (base64PCM) => {
        if (audioPlayer) {
          audioPlayer.playAudio(base64PCM);
        }
      },
      onTranscript: (text, role) => {
        addTranscript(text, role);
      },
      onError: (msg) => {
        alert("Error: " + msg);
        handleDisconnect();
      }
    });

    liveApi.connect();
    } catch (e) {
      console.error("Connect execution failed:", e);
      statusText.textContent = "Error: " + e.message;
      statusText.style.color = "red";
      handleDisconnect();
    }
  }

  function disconnect() {
    if (isRecording) {
      toggleRecording();
    }
    if (liveApi) {
      liveApi.disconnect();
    }
    handleDisconnect();
  }

  function handleDisconnect() {
    isConnected = false;
    statusText.textContent = "Disconnected";
    statusText.classList.remove("connected");
    connectBtn.textContent = "Connect";
    connectBtn.disabled = false;
    apiKeyInput.disabled = false;
    targetLangSelect.disabled = false;
    document.getElementById('sourceLang').disabled = false;
    micBtn.disabled = true;
    currentSourceBubble = null;
    currentTargetBubble = null;
  }

  async function toggleRecording() {
    if (!isConnected) return;

    if (isRecording) {
      // Stop recording
      if (audioStreamer) {
        audioStreamer.stop();
        audioStreamer = null;
      }
      isRecording = false;
      micBtn.classList.remove('active');
      statusText.textContent = "Connected";
    } else {
      // Start recording
      audioStreamer = new AudioStreamer((base64PCM) => {
        if (liveApi && liveApi.isConnected) {
          liveApi.sendAudio(base64PCM);
        }
      });
      
      try {
        await audioStreamer.start();
        isRecording = true;
        micBtn.classList.add('active');
        statusText.textContent = "Listening...";

      } catch (err) {
        alert("Microphone access denied or error: " + err.message);
      }
    }
  }

  function addTranscript(text, role) {
    const isTarget = role === 'target' || role === 'model';
    const container = isTarget ? targetLog : sourceLog;
    const currentBubble = isTarget ? currentTargetBubble : currentSourceBubble;
    const bubbleClass = isTarget ? 'model' : 'user';

    // If we have a current bubble, append to it
    if (currentBubble) {
      currentBubble.textContent += text;
      scrollToBottom();
      return;
    }
    
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${bubbleClass}`;
    bubble.textContent = text;
    
    container.appendChild(bubble);
    scrollToBottom();
    
    if (isTarget) {
      currentTargetBubble = bubble;
      clearTimeout(bubble.timeout);
      bubble.timeout = setTimeout(() => {
        if (currentTargetBubble === bubble) {
          currentTargetBubble = null;
        }
      }, 2000);
    } else {
      currentSourceBubble = bubble;
      clearTimeout(bubble.timeout);
      bubble.timeout = setTimeout(() => {
        if (currentSourceBubble === bubble) {
          currentSourceBubble = null;
        }
      }, 2000);
    }
  }

  function scrollToBottom() {
    sourceLog.scrollTop = sourceLog.scrollHeight;
    targetLog.scrollTop = targetLog.scrollHeight;
  }

  // --- Sidebar Logic ---
  if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', () => {
      historySidebar.classList.add('open');
      renderHistoryList();
    });
  }

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', () => {
      historySidebar.classList.remove('open');
    });
  }

  function renderHistoryList() {
    historyList.innerHTML = '';
    const histories = JSON.parse(localStorage.getItem('gemini_chat_history') || '[]');
    
    if (histories.length === 0) {
      historyList.innerHTML = '<li style="padding: 20px; color: var(--text-secondary);">No history saved yet.</li>';
      return;
    }

    // Render newest first
    histories.reverse().forEach((history, index) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      
      const dateObj = new Date(history.timestamp);
      const timeStr = dateObj.toLocaleString();

      li.innerHTML = `
        <div class="history-item-time">${timeStr}</div>
        <div class="history-item-langs">${history.sourceLang.toUpperCase()} → ${history.targetLang.toUpperCase()}</div>
      `;

      li.addEventListener('click', () => {
        // Load the history into the panes
        sourceLog.innerHTML = '<div class="pane-header">Source Language (You)</div>' + history.sourceHtml;
        targetLog.innerHTML = '<div class="pane-header">Target Language (Gemini)</div>' + history.targetHtml;
        
        // Disable recording if viewing history
        if (isRecording) {
          toggleRecording();
        }
        
        historySidebar.classList.remove('open');
        scrollToBottom();
      });

      historyList.appendChild(li);
    });
  }

  // --- Save history functionality ---
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const sourceBubbles = sourceLog.querySelectorAll('.chat-bubble');
      const targetBubbles = targetLog.querySelectorAll('.chat-bubble');
      
      const maxLen = Math.max(sourceBubbles.length, targetBubbles.length);
      if (maxLen === 0) {
        alert("No history to save yet.");
        return;
      }

      // Save to localStorage as a JSON object
      const histories = JSON.parse(localStorage.getItem('gemini_chat_history') || '[]');
      
      // We will save the HTML content of the bubbles to easily restore them
      const sourceHtml = Array.from(sourceBubbles).map(b => b.outerHTML).join('');
      const targetHtml = Array.from(targetBubbles).map(b => b.outerHTML).join('');

      histories.push({
        timestamp: new Date().getTime(),
        sourceLang: document.getElementById('sourceLang').value,
        targetLang: document.getElementById('targetLang').value,
        sourceHtml: sourceHtml,
        targetHtml: targetHtml
      });

      // Keep only last 20 histories to avoid localStorage quota issues
      if (histories.length > 20) {
        histories.shift();
      }

      localStorage.setItem('gemini_chat_history', JSON.stringify(histories));
      alert("Chat history saved successfully!");
      renderHistoryList();

      // Original text file download
      let historyText = "=== Live Translate History ===\n\n";
      for (let i = 0; i < maxLen; i++) {
        if (i < sourceBubbles.length) {
          historyText += `[Source]: ${sourceBubbles[i].textContent}\n`;
        }
        if (i < targetBubbles.length) {
          historyText += `[Target]: ${targetBubbles[i].textContent}\n`;
        }
        historyText += "\n";
      }

      const blob = new Blob([historyText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translate_history_${new Date().getTime()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
});
