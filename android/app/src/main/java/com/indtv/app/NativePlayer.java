package com.indtv.app;

import android.app.Activity;
import android.net.Uri;
import android.view.Gravity;
import android.view.SurfaceView;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;

/**
 * The TV's own video engine (ExoPlayer), used for streams the web player cannot play: raw MPEG-TS,
 * AC-3 / E-AC-3 sound, HEVC, servers that insist on particular headers, quirky HLS. The picture is drawn on
 * a SurfaceView behind the transparent WebView, so INDTV's own controls stay on top.
 * All calls arrive on the UI thread; events go back to the page as window.INDTVExo(type, a, b).
 */
final class NativePlayer {
    private final Activity activity;
    private final FrameLayout root;
    private final WebView web;
    private SurfaceView surface;
    private ExoPlayer player;
    private String aspect = "fit";
    private int videoW = 0, videoH = 0;
    private float pixelRatio = 1f;
    private boolean readySent = false;

    NativePlayer(Activity activity, FrameLayout root, WebView web) {
        this.activity = activity;
        this.root = root;
        this.web = web;
    }

    boolean isActive() { return player != null; }

    void play(String url, String userAgent, String referrer, int maxHeight) {
        stop();
        readySent = false;
        surface = new SurfaceView(activity);
        root.addView(surface, 0, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER));

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(userAgent != null && !userAgent.isEmpty() ? userAgent
                        : "Mozilla/5.0 (Linux; Android 11; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(10000)
                .setReadTimeoutMs(15000);
        if (referrer != null && !referrer.isEmpty()) {
            Map<String, String> props = new HashMap<String, String>();
            props.put("Referer", referrer);
            try {
                Uri r = Uri.parse(referrer);
                if (r.getScheme() != null && r.getHost() != null) props.put("Origin", r.getScheme() + "://" + r.getHost());
            } catch (Exception ignored) { }
            http.setDefaultRequestProperties(props);
        }
        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 50000, 1500, 3000)
                .build();
        player = new ExoPlayer.Builder(activity)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
                .setLoadControl(load)
                .build();
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.setVideoSurfaceView(surface);
        if (maxHeight > 0) quality(maxHeight);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) send("buffering", "1", "");
                else if (state == Player.STATE_READY) {
                    send("buffering", "0", "");
                    if (!readySent) { readySent = true; send("playing", "", ""); }
                } else if (state == Player.STATE_ENDED) send("ended", "", "");
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) { send("paused", isPlaying ? "0" : "1", ""); }

            @Override
            public void onPlayerError(PlaybackException error) {
                // A live stream that fell behind its window: jump back to the live edge instead of failing.
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW && player != null) {
                    player.seekToDefaultPosition();
                    player.prepare();
                    return;
                }
                send("error", error.getErrorCodeName(), readySent ? "1" : "0");
            }

            @Override
            public void onVideoSizeChanged(VideoSize size) {
                videoW = size.width;
                videoH = size.height;
                pixelRatio = size.pixelWidthHeightRatio > 0 ? size.pixelWidthHeightRatio : 1f;
                layout();
                send("size", String.valueOf(size.width), String.valueOf(size.height));
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                TreeSet<Integer> heights = new TreeSet<Integer>();
                for (Tracks.Group g : tracks.getGroups()) {
                    if (g.getType() != C.TRACK_TYPE_VIDEO) continue;
                    for (int i = 0; i < g.length; i++) {
                        Format f = g.getTrackFormat(i);
                        if (f.height > 0 && g.isTrackSupported(i)) heights.add(f.height);
                    }
                }
                StringBuilder sb = new StringBuilder();
                for (Integer h : heights) { if (sb.length() > 0) sb.append(','); sb.append(h); }
                send("tracks", sb.toString(), "");
            }
        });

        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        String mime = mimeOf(url);
        if (mime != null) item.setMimeType(mime);
        player.setMediaItem(item.build());
        player.setPlayWhenReady(true);
        player.prepare();
    }

    /** Most playlist URLs without an extension are HLS; .ts / .mp4 / Xtream "extension=ts" are progressive. */
    private static String mimeOf(String url) {
        String u = url.toLowerCase(Locale.ROOT);
        String path = u.split("\\?")[0];
        if (path.endsWith(".mpd")) return MimeTypes.APPLICATION_MPD;
        if (path.endsWith(".ts") || path.endsWith(".mp4") || path.endsWith(".mkv") || path.endsWith(".mp3") || path.endsWith(".aac")
                || u.contains("extension=ts") || u.contains("output=ts")) return null;
        return MimeTypes.APPLICATION_M3U8;
    }

    void pause() { if (player != null) player.setPlayWhenReady(false); }

    void resume() { if (player != null) player.setPlayWhenReady(true); }

    void mute(boolean on) { if (player != null) player.setVolume(on ? 0f : 1f); }

    /** Highest picture height allowed (0 = automatic). */
    void quality(int maxHeight) {
        if (player == null) return;
        if (maxHeight > 0) {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                    .setMaxVideoSize(Integer.MAX_VALUE, maxHeight).build());
        } else {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                    .clearVideoSizeConstraints().build());
        }
    }

    void aspect(String mode) {
        aspect = mode == null ? "fit" : mode;
        layout();
    }

    /** Places the picture for the chosen picture size: original, zoom, stretch or a fixed 16:9 / 4:3 / 21:9 frame. */
    private void layout() {
        if (surface == null) return;
        int W = root.getWidth(), H = root.getHeight();
        if (W <= 0 || H <= 0) { root.post(new Runnable() { @Override public void run() { layout(); } }); return; }
        float video = videoW > 0 && videoH > 0 ? (videoW * pixelRatio) / videoH : 16f / 9f;
        int w = W, h = H;
        float screen = (float) W / H;
        float target;
        switch (aspect) {
            case "fill": w = W; h = H; break;
            case "zoom":
                if (video > screen) { h = H; w = Math.round(H * video); } else { w = W; h = Math.round(W / video); }
                break;
            case "16:9": case "4:3": case "21:9":
                target = "16:9".equals(aspect) ? 16f / 9f : "4:3".equals(aspect) ? 4f / 3f : 21f / 9f;
                if (target > screen) { w = W; h = Math.round(W / target); } else { h = H; w = Math.round(H * target); }
                break;
            default:
                if (video > screen) { w = W; h = Math.round(W / video); } else { h = H; w = Math.round(H * video); }
        }
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, Gravity.CENTER);
        surface.setLayoutParams(lp);
    }

    void stop() {
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) { }
            try { player.release(); } catch (Exception ignored) { }
            player = null;
        }
        if (surface != null) {
            root.removeView(surface);
            surface = null;
        }
        videoW = videoH = 0;
    }

    private void send(String type, String a, String b) {
        if (web == null) return;
        String js = "window.INDTVExo && INDTVExo('" + clean(type) + "','" + clean(a) + "','" + clean(b) + "')";
        web.evaluateJavascript(js, null);
    }

    private static String clean(String s) { return s == null ? "" : s.replaceAll("[^A-Za-z0-9_,.:-]", ""); }

}
