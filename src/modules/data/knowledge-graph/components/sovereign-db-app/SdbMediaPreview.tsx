/**
 * SdbMediaPreview — Shows image thumbnails, audio players,
 * and video previews for uploaded media files.
 *
 * @product SovereignDB
 */

import { useState, useRef, useEffect } from "react";
import {
  IconPlayerPlay, IconPlayerPause, IconVolume, IconVolumeOff,
  IconMaximize, IconPhoto, IconVideo, IconMusic,
  IconDownload, IconFile,
} from "@tabler/icons-react";

interface Props {
  fileName: string;
  fileSize: number;
  fileMime: string;
  fileDataUrl?: string; // base64 data URL
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ImagePreview({ src, fileName }: { src: string; fileName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="relative group rounded-xl overflow-hidden border border-border/20 bg-muted/5">
        <img
          src={src}
          alt={fileName}
          className="w-full max-h-[400px] object-contain cursor-pointer"
          onClick={() => setExpanded(true)}
          draggable={false}
        />
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setExpanded(true)}
            className="p-1.5 rounded-lg bg-background/80 backdrop-blur-sm text-foreground hover:bg-background/90 transition-colors shadow-sm"
          >
            <IconMaximize size={14} />
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {expanded && (
        <>
          <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md" onClick={() => setExpanded(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8 pointer-events-none">
            <img
              src={src}
              alt={fileName}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-auto cursor-pointer"
              onClick={() => setExpanded(false)}
              draggable={false}
            />
          </div>
        </>
      )}
    </>
  );
}

function AudioPreview({ src, fileName }: { src: string; fileName: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onDur = () => setDuration(audio.duration || 0);
    const onEnd = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-xl border border-border/20 bg-muted/5 p-4">
      <audio ref={audioRef} src={src} muted={muted} preload="metadata" />
      <div className="flex items-center gap-3">
        {/* Waveform icon */}
        <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
          <IconMusic size={22} className="text-violet-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-os-body font-medium text-foreground truncate mb-2">{fileName}</p>

          {/* Progress bar */}
          <div
            className="h-1.5 bg-muted/30 rounded-full cursor-pointer group"
            onClick={seek}
          >
            <div
              className="h-full bg-violet-400 rounded-full transition-[width] duration-100 relative"
              style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-violet-400 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <span className="text-os-body text-muted-foreground tabular-nums">{formatTime(progress)}</span>
            <span className="text-os-body text-muted-foreground tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 flex items-center justify-center transition-colors"
          >
            {playing ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
          </button>
          <button
            onClick={() => setMuted(!muted)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            {muted ? <IconVolumeOff size={15} /> : <IconVolume size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoPreview({ src, fileName }: { src: string; fileName: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-border/20 bg-muted/5">
      <video
        src={src}
        controls
        className="w-full max-h-[450px] bg-black"
        preload="metadata"
        playsInline
      />
    </div>
  );
}

function GenericFilePreview({ fileName, fileSize, fileMime }: { fileName: string; fileSize: number; fileMime: string }) {
  const ext = fileName.split(".").pop()?.toUpperCase() || "FILE";
  return (
    <div className="rounded-xl border border-border/20 bg-muted/5 p-4 flex items-center gap-4">
      <div className="w-14 h-14 rounded-xl bg-muted/20 flex items-center justify-center shrink-0">
        <div className="text-center">
          <IconFile size={22} className="text-muted-foreground mx-auto" />
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{ext}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-os-body font-medium text-foreground truncate">{fileName}</p>
        <p className="text-os-body text-muted-foreground">{formatSize(fileSize)} · {fileMime || "Unknown type"}</p>
      </div>
    </div>
  );
}

export function SdbMediaPreview({ fileName, fileSize, fileMime, fileDataUrl }: Props) {
  const isImage = fileMime.startsWith("image/");
  const isAudio = fileMime.startsWith("audio/");
  const isVideo = fileMime.startsWith("video/");

  return (
    <div className="mb-4">
      {isImage && fileDataUrl ? (
        <ImagePreview src={fileDataUrl} fileName={fileName} />
      ) : isAudio && fileDataUrl ? (
        <AudioPreview src={fileDataUrl} fileName={fileName} />
      ) : isVideo && fileDataUrl ? (
        <VideoPreview src={fileDataUrl} fileName={fileName} />
      ) : (
        <GenericFilePreview fileName={fileName} fileSize={fileSize} fileMime={fileMime} />
      )}

      {/* File info bar */}
      <div className="flex items-center gap-3 mt-2 px-1">
        <span className="text-os-body text-muted-foreground">{formatSize(fileSize)}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="text-os-body text-muted-foreground">{fileMime}</span>
        {fileDataUrl && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <a
              href={fileDataUrl}
              download={fileName}
              className="flex items-center gap-1 text-os-body text-primary hover:text-primary/80 transition-colors"
            >
              <IconDownload size={12} />
              Download
            </a>
          </>
        )}
      </div>
    </div>
  );
}
