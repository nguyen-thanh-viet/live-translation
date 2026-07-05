class LiveAPI {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.sourceLang = options.sourceLang;
    this.targetLang = options.targetLang;
    this.onConnected = options.onConnected;
    this.onDisconnected = options.onDisconnected;
    this.onAudioReceived = options.onAudioReceived;
    this.onTranscript = options.onTranscript;
    this.onError = options.onError;
    
    this.ws = null;
    this.isConnected = false;
  }

  connect() {
    console.log("LiveAPI connect() called");
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
    console.log("WebSocket URL prepared");
    
    try {
      this.ws = new WebSocket(url);
      console.log("WebSocket object created, waiting for connection...");
      
      this.ws.onopen = () => {
        console.log("WebSocket onopen fired");
        // Send setup message
        const setupMessage = {
          setup: {
            model: "models/gemini-3.5-live-translate-preview",
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Puck"
                  }
                }
              },
              translationConfig: {
                targetLanguageCode: this.targetLang,
                echoTargetLanguage: true
              }
            },
            systemInstruction: {
              parts: [{
                text: this.sourceLang === 'auto' 
                  ? `You are an expert real-time translator. The user will speak in various languages. Auto-detect the spoken language and translate it into language code: ${this.targetLang}. Make sure to accurately recognize non-English languages such as Russian, Vietnamese, etc. Do not default to English.`
                  : `You are an expert real-time translator. The user is explicitly speaking in language code: ${this.sourceLang}. You MUST accurately transcribe this specific language and translate it into language code: ${this.targetLang}. Do NOT assume the input is English.`
              }]
            }
          }
        };

        this.ws.send(JSON.stringify(setupMessage));
      };

      this.ws.onmessage = (event) => {
        console.log("WebSocket onmessage received");
        let response;
        if (event.data instanceof Blob) {
          console.log("Received Blob data of size:", event.data.size);
          const reader = new FileReader();
          reader.onload = () => {
            try {
              response = JSON.parse(reader.result);
              console.log("Parsed Blob JSON:", response);
              this.handleResponse(response);
            } catch(e) {
              console.error("Error parsing blob message:", e);
            }
          };
          reader.readAsText(event.data);
        } else {
          try {
            response = JSON.parse(event.data);
            console.log("Parsed Text JSON:", response);
            this.handleResponse(response);
          } catch(e) {
            console.error("Error parsing text message:", e);
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket onerror fired:", error);
        if (this.onError) this.onError("Connection error. Check your API key.");
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket onclose fired. Code:", event.code, "Reason:", event.reason);
        this.isConnected = false;
        if (this.onDisconnected) this.onDisconnected();
      };
      
    } catch(err) {
      if (this.onError) this.onError(err.message);
    }
  }

  handleResponse(response) {
    if (response.setupComplete) {
      this.isConnected = true;
      if (this.onConnected) this.onConnected();
      return;
    }
    
    if (response.serverContent) {
      const content = response.serverContent;
      
      // Handle User's Speech Transcript
      if (content.inputTranscription && content.inputTranscription.text) {
        if (this.onTranscript) {
          this.onTranscript(content.inputTranscription.text, 'source');
        }
      }
      
      // Handle Model's Translation Transcript
      if (content.outputTranscription && content.outputTranscription.text) {
        if (this.onTranscript) {
          this.onTranscript(content.outputTranscription.text, 'target');
        }
      }
      
      if (content.modelTurn && content.modelTurn.parts) {
        for (const part of content.modelTurn.parts) {
          if (part.inlineData && part.inlineData.data) {
             // Audio data
             if (this.onAudioReceived) {
               this.onAudioReceived(part.inlineData.data);
             }
          }
          // The Live Translate API sends outputTranscription, but occasionally text may be in part.text
          if (part.text && !content.outputTranscription) {
             if (this.onTranscript) {
               this.onTranscript(part.text, 'target');
             }
          }
        }
      }
    }
  }

  sendAudio(base64PCM) {
    if (!this.isConnected || !this.ws) return;
    
    const audioMessage = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: "audio/pcm;rate=16000",
          data: base64PCM
        }]
      }
    };
    
    this.ws.send(JSON.stringify(audioMessage));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
