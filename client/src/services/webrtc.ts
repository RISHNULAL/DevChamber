import { getSocket } from './socket';

export class ScreenShareManager {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private frameInterval: any = null;
  private canvas: HTMLCanvasElement | null = null;

  async startTeacherScreenShare(
    classroomId: string,
    onLocalStream: (stream: MediaStream) => void,
    onStopped: () => void
  ): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { max: 30 },
        },
        audio: false,
      });

      this.localStream = stream;
      onLocalStream(stream);

      const socket = await getSocket();
      socket.emit('screen:start', { classroomId });

      // Handle user stopping screen share via browser bar
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          this.stopScreenShare(classroomId);
          onStopped();
        };
      }

      // Start resilient frame broadcast fallback alongside WebRTC
      this.startFrameBroadcast(classroomId, stream);

      return stream;
    } catch (err) {
      console.error('Failed to get display media:', err);
      throw err;
    }
  }

  private startFrameBroadcast(classroomId: string, stream: MediaStream) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 960;
      this.canvas.height = 540;
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.play().catch(() => {});

    const canvasElem = this.canvas;
    const ctx = canvasElem ? canvasElem.getContext('2d') : null;

    this.frameInterval = setInterval(async () => {
      if (!this.localStream || !ctx || !canvasElem) return;
      try {
        ctx.drawImage(video, 0, 0, 960, 540);
        const frameData = canvasElem.toDataURL('image/jpeg', 0.5);
        const socket = await getSocket();
        socket.emit('screen:frame', { classroomId, frame: frameData });
      } catch {
        // Frame capture error ignored
      }
    }, 150); // ~7 FPS frame broadcast ensures smooth & lightweight display fallback
  }

  async stopScreenShare(classroomId: string) {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();

    const socket = await getSocket();
    socket.emit('screen:stop', { classroomId });
  }

  async setupStudentScreenListener(
    _classroomId: string,
    onRemoteStream: (stream: MediaStream | null) => void,
    onFrame: (frameUrl: string | null) => void
  ) {
    const socket = await getSocket();

    socket.on('screen:start', () => {
      // Teacher started screen share
    });

    socket.on('screen:stop', () => {
      onRemoteStream(null);
      onFrame(null);
    });

    socket.on('screen:frame', ({ frame }: { frame: string }) => {
      onFrame(frame);
    });

    return () => {
      socket.off('screen:start');
      socket.off('screen:stop');
      socket.off('screen:frame');
    };
  }
}

export const screenShareManager = new ScreenShareManager();
