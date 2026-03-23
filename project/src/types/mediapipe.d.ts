declare module '@mediapipe/face_mesh' {
  export class FaceMesh {
    constructor(config?: any);
    setOptions(options: any): void;
    onResults(cb: (results: any) => void): void;
    send(input: any): Promise<void>;
    close(): void;
  }

  export const FACEMESH_TESSELATION: any;
  export const FACEMESH_FACE_OVAL: any;
  export const FACEMESH_LIPS: any;
}

declare module '@mediapipe/camera_utils' {
  export class Camera {
    constructor(video: HTMLVideoElement, config: any);
    start(): Promise<void>;
    stop(): void;
  }
}

declare module '@mediapipe/drawing_utils' {
  export function drawConnectors(ctx: CanvasRenderingContext2D, landmarks: any, connections: any, style?: any): void;
  export function drawLandmarks(ctx: CanvasRenderingContext2D, landmarks: any, style?: any): void;
}
