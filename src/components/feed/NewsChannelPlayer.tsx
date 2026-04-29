import { useEffect, useRef } from 'preact/hooks';
import {
  type NewsChannel,
  extractYoutubeId,
} from '../../state/news-channels.ts';

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/+esm';

type Props = { channel: NewsChannel; muted: boolean };

export function NewsChannelPlayer({ channel, muted }: Props) {
  if (channel.type === 'youtube') {
    const id = extractYoutubeId(channel.url);
    if (!id) return <PlayerError message="Couldn't extract YouTube video id from this URL." />;
    const muteFlag = muted ? '1' : '0';
    return (
      <iframe
        className="sm-news-iframe"
        src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=${muteFlag}&controls=1&modestbranding=1&playsinline=1&rel=0`}
        title={channel.name}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        allowFullscreen
      />
    );
  }

  if (channel.type === 'hls') {
    return <HlsVideoPlayer url={channel.url} muted={muted} />;
  }

  if (channel.type === 'video') {
    return (
      <video
        className="sm-news-video"
        src={channel.url}
        controls
        autoPlay
        muted={muted}
        playsInline
      />
    );
  }

  if (channel.type === 'rtmp') {
    return (
      <PlayerError
        message="RTMP can't play in browsers. Use the HLS (.m3u8) endpoint of this stream instead — most CDNs publish both."
      />
    );
  }

  return <PlayerError message="Unknown stream type. Paste a YouTube, .m3u8, or .mp4 URL." />;
}

function PlayerError({ message }: { message: string }) {
  return (
    <div className="sm-news-error" data-testid="signalmap-news-player-error">
      <div className="sm-news-error-icon">⚠</div>
      <div className="sm-news-error-msg">{message}</div>
    </div>
  );
}

type HlsAttachable = {
  isSupported(): boolean;
  new (config?: object): {
    loadSource(url: string): void;
    attachMedia(el: HTMLMediaElement): void;
    destroy(): void;
  };
};

function HlsVideoPlayer({ url, muted }: { url: string; muted: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    let hlsInstance: { destroy(): void } | null = null;

    function showError(msg: string) {
      if (errorRef.current) {
        errorRef.current.textContent = msg;
        errorRef.current.classList.add('visible');
      }
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari, iOS, recent Edge).
      video.src = url;
    } else {
      // Lazy-load hls.js from CDN. The /* @vite-ignore */ comment prevents
      // Vite's import analysis from trying to bundle a remote URL.
      import(/* @vite-ignore */ HLS_CDN)
        .then((mod: { default: HlsAttachable }) => {
          if (destroyed) return;
          const Hls = mod.default;
          if (!Hls.isSupported()) {
            showError('Your browser does not support MSE — HLS playback unavailable.');
            return;
          }
          const hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(video);
          hlsInstance = hls;
        })
        .catch(() => {
          if (!destroyed) showError('Failed to load HLS player. Check your network.');
        });
    }

    return () => {
      destroyed = true;
      hlsInstance?.destroy();
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
    };
  }, [url]);

  return (
    <div className="sm-news-hls-wrap">
      <video
        ref={videoRef}
        className="sm-news-video"
        controls
        autoPlay
        muted={muted}
        playsInline
        data-testid="signalmap-news-hls-video"
      />
      <div ref={errorRef} className="sm-news-hls-error" />
    </div>
  );
}
