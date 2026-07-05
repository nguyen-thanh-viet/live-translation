class AudioStreamer {
  constructor(onAudioData) {
    this.onAudioData = onAudioData;
    this.audioContext = null;
    this.stream = null;
    this.processor = null;
    this.input = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: 1,
      sampleRate: 16000
    } });
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    this.input = this.audioContext.createMediaStreamSource(this.stream);
    
    // 4096 frames = ~256ms of audio at 16kHz
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const channelData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.floatTo16BitPCM(channelData);
      const base64 = this.bufferToBase64(pcm16);
      if (this.onAudioData) {
        this.onAudioData(base64);
      }
    };
    
    this.input.connect(this.processor);
    // Connecting to destination is required for ScriptProcessor to run
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    if (this.input) {
      this.input.disconnect();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // true for little-endian
    }
    return buffer;
  }

  bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

class AudioPlayer {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    this.nextTime = 0;
  }
  
  playAudio(base64Data) {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert PCM16 to Float32
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    
    const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    const currentTime = this.audioContext.currentTime;
    if (this.nextTime < currentTime) {
      this.nextTime = currentTime;
    }
    source.start(this.nextTime);
    this.nextTime += audioBuffer.duration;
  }
}
