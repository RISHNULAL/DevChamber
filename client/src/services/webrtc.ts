import { getSocket } from './socket';

export interface ParticipantMediaState {
  socketId: string;
  userId: string;
  name: string;
  role: string;
  micEnabled: boolean;
  camEnabled: boolean;
  isSharingScreen: boolean;
  speaking?: boolean;
}

export interface RemoteParticipantStream {
  socketId: string;
  userId: string;
  name: string;
  role: string;
  userMediaStream: MediaStream | null;
  screenStream: MediaStream | null;
  micEnabled: boolean;
  camEnabled: boolean;
  isSharingScreen: boolean;
  speaking: boolean;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export class VideoClassroomManager {
  private localUserMediaStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private remoteStreams: Map<string, { userMedia: MediaStream; screen: MediaStream | null }> = new Map();
  private participants: Map<string, ParticipantMediaState> = new Map();

  private classroomId: string = '';
  private currentUserId: string = '';
  private currentUserName: string = '';
  private micEnabled: boolean = true;
  private camEnabled: boolean = true;
  private isSharingScreen: boolean = false;

  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localAudioSource: MediaStreamAudioSourceNode | null = null;
  private speechCheckInterval: any = null;

  // Callbacks
  private onParticipantsUpdate?: (participants: ParticipantMediaState[]) => void;
  private onRemoteStreamsUpdate?: (streams: Map<string, { userMedia: MediaStream; screen: MediaStream | null }>) => void;
  private onScreenShareChange?: (isSharing: boolean, teacherName?: string, stream?: MediaStream | null) => void;
  private onClassEnded?: (message: string) => void;
  private onSpeakingChange?: (socketId: string, isSpeaking: boolean) => void;

  /**
   * Request local Camera and Microphone.
   */
  async initLocalMedia(videoWanted: boolean = true, audioWanted: boolean = true): Promise<MediaStream> {
    try {
      this.micEnabled = audioWanted;
      this.camEnabled = videoWanted;

      const constraints: MediaStreamConstraints = {
        video: videoWanted
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 30 },
            }
          : false,
        audio: audioWanted
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
      };

      // If user wants neither, create empty MediaStream
      if (!videoWanted && !audioWanted) {
        this.localUserMediaStream = new MediaStream();
        return this.localUserMediaStream;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        console.warn('[WebRTC] Preferred media constraints failed, falling back to basic audio/video:', err);
        // Fallback to basic audio/video or just audio if video failed
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoWanted,
            audio: audioWanted,
          });
        } catch (innerErr) {
          console.warn('[WebRTC] Video+Audio failed, trying audio only:', innerErr);
          if (audioWanted) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.camEnabled = false;
          } else {
            stream = new MediaStream();
            this.camEnabled = false;
            this.micEnabled = false;
          }
        }
      }

      this.localUserMediaStream = stream;

      // Apply initial mute/unmute state to tracks
      stream.getAudioTracks().forEach((track) => {
        track.enabled = this.micEnabled;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = this.camEnabled;
      });

      this.setupLocalAudioAnalyser();

      return stream;
    } catch (err: any) {
      console.error('[WebRTC] Failed to initialize media devices:', err);
      this.localUserMediaStream = new MediaStream();
      this.camEnabled = false;
      this.micEnabled = false;
      return this.localUserMediaStream;
    }
  }

  getLocalUserMediaStream(): MediaStream | null {
    return this.localUserMediaStream;
  }

  getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  isMicEnabled(): boolean {
    return this.micEnabled;
  }

  isCamEnabled(): boolean {
    return this.camEnabled;
  }

  isScreenSharingActive(): boolean {
    return this.isSharingScreen;
  }

  /**
   * Toggle local microphone.
   */
  toggleMicrophone(wantedState?: boolean): boolean {
    const nextState = wantedState !== undefined ? wantedState : !this.micEnabled;
    this.micEnabled = nextState;

    if (this.localUserMediaStream) {
      this.localUserMediaStream.getAudioTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }

    this.broadcastMediaState();
    return this.micEnabled;
  }

  /**
   * Toggle local camera.
   */
  async toggleCamera(wantedState?: boolean): Promise<boolean> {
    const nextState = wantedState !== undefined ? wantedState : !this.camEnabled;
    this.camEnabled = nextState;

    if (this.localUserMediaStream) {
      const videoTracks = this.localUserMediaStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((track) => {
          track.enabled = nextState;
        });
      } else if (nextState) {
        // Track was not created earlier, fetch new video track
        try {
          const freshStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } },
          });
          const newTrack = freshStream.getVideoTracks()[0];
          if (newTrack) {
            this.localUserMediaStream.addTrack(newTrack);
            // Add track to existing peer connections
            for (const pc of this.peerConnections.values()) {
              pc.addTrack(newTrack, this.localUserMediaStream);
            }
          }
        } catch (err) {
          console.warn('[WebRTC] Could not enable camera dynamically:', err);
          this.camEnabled = false;
        }
      }
    }

    this.broadcastMediaState();
    return this.camEnabled;
  }

  /**
   * Broadcast media state (mic, camera, screen) over Socket.IO.
   */
  private broadcastMediaState() {
    const socket = getSocket();
    if (!socket || !this.classroomId) return;

    socket.emit('participant:media-state', {
      classroomId: this.classroomId,
      userId: this.currentUserId,
      micEnabled: this.micEnabled,
      camEnabled: this.camEnabled,
      isSharingScreen: this.isSharingScreen,
    });
  }

  /**
   * Setup Web Audio API analyser to detect local user speaking.
   */
  private setupLocalAudioAnalyser() {
    try {
      if (!this.localUserMediaStream || this.localUserMediaStream.getAudioTracks().length === 0) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      this.localAudioSource = this.audioContext.createMediaStreamSource(this.localUserMediaStream);
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localAnalyser.smoothingTimeConstant = 0.5;
      this.localAudioSource.connect(this.localAnalyser);

      const buffer = new Uint8Array(this.localAnalyser.frequencyBinCount);

      if (this.speechCheckInterval) clearInterval(this.speechCheckInterval);
      this.speechCheckInterval = setInterval(() => {
        if (!this.localAnalyser || !this.micEnabled) {
          this.onSpeakingChange?.('local', false);
          return;
        }

        this.localAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const isSpeaking = avg > 18; // amplitude threshold
        this.onSpeakingChange?.('local', isSpeaking);
      }, 200);
    } catch (e) {
      console.warn('[WebRTC] Local audio analyser setup skipped:', e);
    }
  }

  /**
   * Join a classroom call room & setup listeners.
   */
  joinClassroomCall(
    classroomId: string,
    user: { userId: string; name: string; role: string; micEnabled?: boolean; camEnabled?: boolean },
    callbacks: {
      onParticipantsUpdate: (participants: ParticipantMediaState[]) => void;
      onRemoteStreamsUpdate: (streams: Map<string, { userMedia: MediaStream; screen: MediaStream | null }>) => void;
      onScreenShareChange: (isSharing: boolean, teacherName?: string, stream?: MediaStream | null) => void;
      onClassEnded: (message: string) => void;
      onSpeakingChange?: (socketId: string, isSpeaking: boolean) => void;
    }
  ) {
    this.classroomId = classroomId;
    this.currentUserId = user.userId;
    this.currentUserName = user.name;
    if (user.micEnabled !== undefined) this.micEnabled = user.micEnabled;
    if (user.camEnabled !== undefined) this.camEnabled = user.camEnabled;

    this.onParticipantsUpdate = callbacks.onParticipantsUpdate;
    this.onRemoteStreamsUpdate = callbacks.onRemoteStreamsUpdate;
    this.onScreenShareChange = callbacks.onScreenShareChange;
    this.onClassEnded = callbacks.onClassEnded;
    this.onSpeakingChange = callbacks.onSpeakingChange;

    const socket = getSocket();
    this.setupSocketSignaling(socket);

    // Join the call in backend
    socket.emit('classroom:join-call', {
      classroomId,
      userId: user.userId,
      name: user.name,
      role: user.role,
      micEnabled: this.micEnabled,
      camEnabled: this.camEnabled,
      isSharingScreen: this.isSharingScreen,
    });
  }

  /**
   * Set up all Socket.IO signaling event listeners.
   */
  private setupSocketSignaling(socket: any) {
    // 1. Initial call roster when joining
    socket.on('call:roster', async (data: { participants: ParticipantMediaState[]; activeShare?: any }) => {
      console.log('[WebRTC] Received call:roster with', data.participants.length, 'participants');
      this.participants.clear();
      data.participants.forEach((p) => {
        if (p.socketId !== socket.id) {
          this.participants.set(p.socketId, p);
        }
      });
      this.notifyParticipants();

      // Check if instructor is currently sharing screen
      if (data.activeShare && data.activeShare.isSharing) {
        this.onScreenShareChange?.(true, data.activeShare.teacherName || 'Instructor');
      }

      // Initiate WebRTC offers to existing participants in the call
      for (const p of data.participants) {
        if (p.socketId !== socket.id) {
          try {
            await this.createPeerConnectionAndOffer(p.socketId);
          } catch (err) {
            console.warn('[WebRTC] Error initiating peer connection to', p.name, err);
          }
        }
      }
    });

    // 2. New participant joined call
    socket.on('participant:joined', (p: ParticipantMediaState) => {
      console.log('[WebRTC] Participant joined:', p.name, p.socketId);
      if (p.socketId !== socket.id) {
        this.participants.set(p.socketId, p);
        this.notifyParticipants();
      }
    });

    // 3. Participant media state update (mic, cam, screen share)
    socket.on('participant:media-state', (p: ParticipantMediaState) => {
      if (p.socketId && this.participants.has(p.socketId)) {
        const existing = this.participants.get(p.socketId)!;
        this.participants.set(p.socketId, {
          ...existing,
          micEnabled: p.micEnabled,
          camEnabled: p.camEnabled,
          isSharingScreen: p.isSharingScreen,
        });
        this.notifyParticipants();
      }
    });

    // 4. WebRTC Offer received
    socket.on('webrtc:offer', async (data: { fromSocketId: string; offer: RTCSessionDescriptionInit; streamType?: string }) => {
      console.log('[WebRTC] Received offer from', data.fromSocketId);
      try {
        await this.handleReceiveOffer(data.fromSocketId, data.offer);
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    });

    // 5. WebRTC Answer received
    socket.on('webrtc:answer', async (data: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Received answer from', data.fromSocketId);
      try {
        const pc = this.peerConnections.get(data.fromSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          // Flush any pending queued ICE candidates
          const queued = this.pendingCandidates.get(data.fromSocketId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          this.pendingCandidates.delete(data.fromSocketId);
        }
      } catch (err) {
        console.error('[WebRTC] Error handling answer:', err);
      }
    });

    // 6. WebRTC ICE Candidate received
    socket.on('webrtc:ice-candidate', async (data: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      if (!data.candidate) return;
      const pc = this.peerConnections.get(data.fromSocketId);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.warn('[WebRTC] Error adding ICE candidate:', err);
        }
      } else {
        // Queue candidate until remote description is set
        const list = this.pendingCandidates.get(data.fromSocketId) || [];
        list.push(data.candidate);
        this.pendingCandidates.set(data.fromSocketId, list);
      }
    });

    // 7. Participant left call
    socket.on('participant:left', (data: { socketId: string; userId: string }) => {
      console.log('[WebRTC] Participant left:', data.socketId);
      this.cleanupPeer(data.socketId);
    });

    // 8. Screen share broadcasts
    socket.on('screen:start', (data: { teacherSocketId?: string; teacherName?: string }) => {
      this.onScreenShareChange?.(true, data.teacherName || 'Instructor');
      if (data.teacherSocketId && data.teacherSocketId !== socket.id) {
        // Request stream renegotiation if needed
        socket.emit('webrtc:request-stream', { classroomId: this.classroomId, targetSocketId: data.teacherSocketId });
      }
    });

    socket.on('screen:stop', () => {
      this.onScreenShareChange?.(false);
      // Remove any remote screen streams
      for (const [sId, entry] of this.remoteStreams.entries()) {
        if (entry.screen) {
          entry.screen.getTracks().forEach((t) => t.stop());
          this.remoteStreams.set(sId, { ...entry, screen: null });
        }
      }
      this.onRemoteStreamsUpdate?.(new Map(this.remoteStreams));
    });

    // 9. Class ended by instructor
    socket.on('class:ended', (data: { message?: string }) => {
      this.cleanupAll();
      this.onClassEnded?.(data?.message || 'The instructor has ended the live class.');
    });
  }

  /**
   * Create Peer Connection and send Offer to target socket.
   */
  private async createPeerConnectionAndOffer(targetSocketId: string) {
    const pc = this.getOrCreatePeerConnection(targetSocketId);

    // Add local user media tracks (camera, mic)
    if (this.localUserMediaStream) {
      this.localUserMediaStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localUserMediaStream!);
        } catch (e) {
          console.warn('[WebRTC] addTrack warning:', e);
        }
      });
    }

    // Add local screen share tracks if active
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.localScreenStream!);
        } catch (e) {
          console.warn('[WebRTC] screen addTrack warning:', e);
        }
      });
    }

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);

    const socket = getSocket();
    socket.emit('webrtc:offer', {
      classroomId: this.classroomId,
      targetSocketId,
      offer,
    });
  }

  /**
   * Handle receiving an Offer, reply with Answer.
   */
  private async handleReceiveOffer(fromSocketId: string, offer: RTCSessionDescriptionInit) {
    const pc = this.getOrCreatePeerConnection(fromSocketId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Flush any pending candidates
    const queued = this.pendingCandidates.get(fromSocketId) || [];
    for (const cand of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    }
    this.pendingCandidates.delete(fromSocketId);

    // Add local tracks to send back
    if (this.localUserMediaStream) {
      const existingSenders = pc.getSenders();
      this.localUserMediaStream.getTracks().forEach((track) => {
        const alreadyAdded = existingSenders.some((s) => s.track === track);
        if (!alreadyAdded) {
          try {
            pc.addTrack(track, this.localUserMediaStream!);
          } catch (e) {
            console.warn('[WebRTC] addTrack error:', e);
          }
        }
      });
    }

    if (this.localScreenStream) {
      const existingSenders = pc.getSenders();
      this.localScreenStream.getTracks().forEach((track) => {
        const alreadyAdded = existingSenders.some((s) => s.track === track);
        if (!alreadyAdded) {
          try {
            pc.addTrack(track, this.localScreenStream!);
          } catch (e) {
            console.warn('[WebRTC] screen addTrack error:', e);
          }
        }
      });
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const socket = getSocket();
    socket.emit('webrtc:answer', {
      classroomId: this.classroomId,
      targetSocketId: fromSocketId,
      answer,
    });
  }

  /**
   * Helper to get or initialize an RTCPeerConnection for a remote socket.
   */
  private getOrCreatePeerConnection(targetSocketId: string): RTCPeerConnection {
    if (this.peerConnections.has(targetSocketId)) {
      return this.peerConnections.get(targetSocketId)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(targetSocketId, pc);

    const socket = getSocket();

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice-candidate', {
          classroomId: this.classroomId,
          targetSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Track received from remote peer
    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack received track kind:', event.track.kind, 'stream count:', event.streams.length);
      const stream = event.streams[0] || new MediaStream([event.track]);
      const isScreen = stream.getVideoTracks().some((t) => t.label.toLowerCase().includes('screen') || t.label.toLowerCase().includes('window') || t.label.toLowerCase().includes('display'));

      const current = this.remoteStreams.get(targetSocketId) || { userMedia: new MediaStream(), screen: null };

      if (isScreen || event.track.kind === 'video' && current.userMedia.getVideoTracks().length > 0) {
        // Treat as screen share stream
        current.screen = stream;
        this.onScreenShareChange?.(true, this.participants.get(targetSocketId)?.name || 'Instructor', stream);
      } else {
        // Camera / Mic user media
        current.userMedia.addTrack(event.track);
      }

      this.remoteStreams.set(targetSocketId, current);
      this.onRemoteStreamsUpdate?.(new Map(this.remoteStreams));
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${targetSocketId} connection state:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.cleanupPeer(targetSocketId);
      }
    };

    return pc;
  }

  /**
   * TEACHER: Start screen sharing with getDisplayMedia().
   */
  async startScreenShare(teacherName: string): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { max: 30 },
        },
        audio: true, // Allow sharing tab/system audio if user desires
      });

      this.localScreenStream = stream;
      this.isSharingScreen = true;

      // Handle browser's native "Stop Sharing" button
      const screenTrack = stream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.onended = () => {
          this.stopScreenShare();
        };
      }

      // Add screen tracks to all active peer connections
      for (const pc of this.peerConnections.values()) {
        stream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, stream);
          } catch (e) {
            console.warn('[WebRTC] Error adding screen track to peer:', e);
          }
        });
      }

      // Renegotiate with all peers
      for (const targetSocketId of this.peerConnections.keys()) {
        try {
          await this.createPeerConnectionAndOffer(targetSocketId);
        } catch (e) {
          console.warn('[WebRTC] Error renegotiating screen share with peer:', e);
        }
      }

      const socket = getSocket();
      socket.emit('screen:start', {
        classroomId: this.classroomId,
        teacherName: teacherName || this.currentUserName,
      });

      this.broadcastMediaState();
      this.onScreenShareChange?.(true, teacherName || this.currentUserName, stream);

      return stream;
    } catch (err) {
      console.error('[WebRTC] Failed to get display media:', err);
      this.isSharingScreen = false;
      throw err;
    }
  }

  /**
   * Stop screen sharing.
   */
  stopScreenShare() {
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
    }

    this.isSharingScreen = false;
    this.broadcastMediaState();

    const socket = getSocket();
    if (socket && this.classroomId) {
      socket.emit('screen:stop', { classroomId: this.classroomId });
    }

    this.onScreenShareChange?.(false);
  }

  /**
   * Clean up an individual peer connection and its streams.
   */
  private cleanupPeer(socketId: string) {
    if (this.peerConnections.has(socketId)) {
      this.peerConnections.get(socketId)?.close();
      this.peerConnections.delete(socketId);
    }
    this.pendingCandidates.delete(socketId);
    this.remoteStreams.delete(socketId);
    this.participants.delete(socketId);

    this.notifyParticipants();
    this.onRemoteStreamsUpdate?.(new Map(this.remoteStreams));
  }

  /**
   * Leave call and clean up all resources.
   */
  leaveCall() {
    const socket = getSocket();
    if (socket && this.classroomId) {
      socket.emit('classroom:leave-call', { classroomId: this.classroomId });
    }
    this.cleanupAll();
  }

  /**
   * Teacher ends the live class for everyone.
   */
  endClass() {
    const socket = getSocket();
    if (socket && this.classroomId) {
      socket.emit('class:end', { classroomId: this.classroomId });
    }
    this.cleanupAll();
  }

  /**
   * Clean up all local tracks, peer connections, and audio contexts.
   */
  private cleanupAll() {
    if (this.speechCheckInterval) {
      clearInterval(this.speechCheckInterval);
      this.speechCheckInterval = null;
    }

    if (this.localUserMediaStream) {
      this.localUserMediaStream.getTracks().forEach((t) => t.stop());
      this.localUserMediaStream = null;
    }

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
    }

    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();
    this.pendingCandidates.clear();
    this.remoteStreams.clear();
    this.participants.clear();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    const socket = getSocket();
    if (socket) {
      socket.off('call:roster');
      socket.off('participant:joined');
      socket.off('participant:media-state');
      socket.off('webrtc:offer');
      socket.off('webrtc:answer');
      socket.off('webrtc:ice-candidate');
      socket.off('participant:left');
      socket.off('screen:start');
      socket.off('screen:stop');
      socket.off('class:ended');
    }

    this.notifyParticipants();
    this.onRemoteStreamsUpdate?.(new Map());
    this.onScreenShareChange?.(false);
  }

  private notifyParticipants() {
    this.onParticipantsUpdate?.(Array.from(this.participants.values()));
  }
}

export const videoClassroomManager = new VideoClassroomManager();
export const screenShareManager = videoClassroomManager;
