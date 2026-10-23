package tv.nova.app;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.media.TimedText;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Video behind the transparent WebView. The fast ExoPlayer engine plays everything it can; files it cannot
 * open (rare containers) fall back to the system MediaPlayer. Both report the same state and events.
 */
final class Player implements SurfaceHolder.Callback, ExoEngine.Host {
    private static final String TAG = "NovaPlayer";

    interface Events {
        void onPlayerEvent(JSONObject ev);
    }

    private final SurfaceView surface;
    private final FrameLayout root;
    private final Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaPlayer mp;
    private boolean surfaceReady;
    private boolean prepared;
    private boolean buffering;
    private boolean userPaused;
    private boolean completed;
    private boolean muted;
    private long preparedAt;
    private int startAt;
    private float speed = 1f;
    private int videoW, videoH;
    private int session;

    private volatile String cachedState = "{\"active\":false}";
    private ExoEngine exo;
    private boolean useExo;

    Player(FrameLayout root, SurfaceView surface, Events events) {
        this.root = root;
        this.surface = surface;
        this.events = events;
        surface.getHolder().addCallback(this);
        try {
            exo = new ExoEngine(root.getContext(), surface, this);
        } catch (Throwable t) {
            Log.w(TAG, "fast engine unavailable", t);
            exo = null;
        }
        main.post(ticker);
    }

    // ---- ExoEngine.Host
    @Override
    public void onExoEvent(String type, JSONObject data) {
        if (useExo) emit(type, data);
    }

    @Override
    public void onExoVideoSize(int w, int h) {
        videoW = w;
        videoH = h;
        layoutSurface();
    }

    @Override
    public void onExoUnsupported(String url, int startMs) {
        Log.i(TAG, "fast engine cannot open this file; using the system player");
        useExo = false;
        playMp(url, startMs);
    }

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            updateState();
            // Autoplay watchdog: some TV firmwares ignore the first start() while the surface or the
            // audio sink is still coming up. If nobody paused on purpose, keep nudging it to play.
            try {
                if (mp != null && prepared && !userPaused && !completed && !mp.isPlaying()
                        && SystemClock.uptimeMillis() - preparedAt > 600) {
                    mp.start();
                }
            } catch (Exception ignored) {
            }
            main.postDelayed(this, 250);
        }
    };

    String state() {
        return cachedState;
    }

    private void updateState() {
        if (useExo && exo != null) { cachedState = exo.state(); return; }
        try {
            JSONObject o = new JSONObject();
            o.put("active", mp != null);
            if (mp != null) {
                o.put("prepared", prepared);
                o.put("buffering", buffering || !prepared);
                if (prepared) {
                    o.put("pos", mp.getCurrentPosition());
                    o.put("dur", mp.getDuration());
                    o.put("playing", mp.isPlaying());
                }
                o.put("speed", speed);
                o.put("muted", muted);
                o.put("w", videoW);
                o.put("h", videoH);
            }
            cachedState = o.toString();
        } catch (Exception ignored) {
        }
    }

    void play(final String url, final int startMs) {
        release();
        if (exo != null) {
            useExo = true;
            videoW = videoH = 0;
            try {
                exo.play(url, startMs);
                exo.setMuted(muted);
                exo.setSpeed(speed);
                updateState();
                return;
            } catch (Throwable t) {
                Log.w(TAG, "fast engine failed to start", t);
                try { exo.release(); } catch (Throwable ignored) { }
                useExo = false;
            }
        }
        playMp(url, startMs);
    }

    private void playMp(final String url, final int startMs) {
        final int my = ++session;
        prepared = false;
        buffering = true;
        userPaused = false;
        completed = false;
        startAt = startMs;
        videoW = videoH = 0;
        try {
            mp = new MediaPlayer();
            if (Build.VERSION.SDK_INT >= 21) {
                mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build());
            }
            mp.setScreenOnWhilePlaying(true);
            if (surfaceReady) mp.setDisplay(surface.getHolder());
            mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override
                public void onPrepared(MediaPlayer p) {
                    if (my != session) return;
                    prepared = true;
                    buffering = false;
                    preparedAt = SystemClock.uptimeMillis();
                    if (startAt > 0) p.seekTo(startAt);
                    applySpeed();
                    applyVolume();
                    if (!userPaused) p.start();
                    emit("prepared", tracksJson());
                }
            });
            mp.setOnInfoListener(new MediaPlayer.OnInfoListener() {
                @Override
                public boolean onInfo(MediaPlayer p, int what, int extra) {
                    if (my != session) return false;
                    if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) {
                        buffering = true;
                        emit("buffering", null);
                    } else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END || what == 3 /* VIDEO_RENDERING_START */) {
                        buffering = false;
                        emit(what == 3 ? "rendering" : "ready", null);
                    }
                    return false;
                }
            });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer p, int what, int extra) {
                    if (my != session) return true;
                    try {
                        emit("error", new JSONObject().put("what", what).put("extra", extra));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
            });
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer p) {
                    if (my != session) return;
                    completed = true;
                    emit("ended", null);
                }
            });
            mp.setOnVideoSizeChangedListener(new MediaPlayer.OnVideoSizeChangedListener() {
                @Override
                public void onVideoSizeChanged(MediaPlayer p, int w, int h) {
                    if (my != session) return;
                    videoW = w;
                    videoH = h;
                    layoutSurface();
                }
            });
            mp.setOnTimedTextListener(new MediaPlayer.OnTimedTextListener() {
                @Override
                public void onTimedText(MediaPlayer p, TimedText text) {
                    if (my != session) return;
                    try {
                        emit("subtitle", new JSONObject().put("text", text == null || text.getText() == null ? "" : text.getText()));
                    } catch (Exception ignored) {
                    }
                }
            });
            mp.setDataSource(url);
            mp.prepareAsync();
        } catch (Exception e) {
            Log.e(TAG, "play failed", e);
            try {
                emit("error", new JSONObject().put("what", -1).put("message", String.valueOf(e.getMessage())));
            } catch (Exception ignored) {
            }
        }
        updateState();
    }

    private JSONObject tracksJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("dur", mp.getDuration());
            JSONArray arr = new JSONArray();
            MediaPlayer.TrackInfo[] tracks = mp.getTrackInfo();
            for (int i = 0; tracks != null && i < tracks.length; i++) {
                int type = tracks[i].getTrackType();
                if (type == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO || type == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT
                        || type == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_SUBTITLE) {
                    JSONObject t = new JSONObject();
                    t.put("index", i);
                    t.put("type", type == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO ? "audio" : "text");
                    t.put("lang", tracks[i].getLanguage());
                    arr.put(t);
                }
            }
            o.put("tracks", arr);
            if (Build.VERSION.SDK_INT >= 21) {
                o.put("audioSel", mp.getSelectedTrack(MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO));
                o.put("textSel", mp.getSelectedTrack(MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT));
            }
        } catch (Exception ignored) {
        }
        return o;
    }

    void selectTrack(int index, boolean select) {
        if (useExo) { exo.selectTrack(index, select); return; }
        if (mp == null || !prepared) return;
        try {
            if (select) mp.selectTrack(index);
            else mp.deselectTrack(index);
        } catch (Exception e) {
            Log.w(TAG, "track", e);
        }
    }

    void setMuted(boolean m) {
        muted = m;
        if (useExo) { exo.setMuted(m); return; }
        applyVolume();
    }

    private void applyVolume() {
        if (mp == null) return;
        try {
            float v = muted ? 0f : 1f;
            mp.setVolume(v, v);
        } catch (Exception ignored) {
        }
    }

    void pause() {
        userPaused = true;
        if (useExo) { exo.pause(); updateState(); return; }
        if (mp != null && prepared && mp.isPlaying()) mp.pause();
        updateState();
    }

    void resume() {
        userPaused = false;
        completed = false;
        if (useExo) { exo.resume(); updateState(); return; }
        if (mp != null && prepared && !mp.isPlaying()) mp.start();
        updateState();
    }

    void seek(int ms) {
        if (useExo) { exo.seek(ms); updateState(); return; }
        if (mp == null || !prepared) {
            startAt = ms;
            return;
        }
        completed = false;
        if (Build.VERSION.SDK_INT >= 26) mp.seekTo(ms, MediaPlayer.SEEK_PREVIOUS_SYNC);
        else mp.seekTo(ms);
        updateState();
    }

    void setSpeed(float s) {
        speed = s;
        if (useExo) { exo.setSpeed(s); return; }
        applySpeed();
    }

    private void applySpeed() {
        if (mp == null || !prepared || Build.VERSION.SDK_INT < 23) return;
        try {
            boolean wasPlaying = mp.isPlaying();
            PlaybackParams pp = mp.getPlaybackParams();
            pp.setSpeed(speed);
            mp.setPlaybackParams(pp);
            if (!wasPlaying) mp.pause();
        } catch (Exception e) {
            Log.w(TAG, "speed", e);
        }
    }

    void release() {
        session++;
        if (exo != null) { try { exo.release(); } catch (Throwable ignored) { } }
        useExo = false;
        if (mp != null) {
            try {
                mp.reset();
                mp.release();
            } catch (Exception ignored) {
            }
            mp = null;
        }
        prepared = false;
        buffering = false;
        updateState();
    }

    /** fit (original proportions) | fill (stretch to the screen) | zoom (fill, crop edges) | 16:9 | 4:3 | 21:9 */
    private String aspectMode = "fit";

    void setAspect(String mode) {
        aspectMode = mode == null ? "fit" : mode;
        layoutSurface();
    }

    private void layoutSurface() {
        int pw = root.getWidth(), ph = root.getHeight();
        if (pw == 0 || ph == 0 || videoW == 0 || videoH == 0) return;
        float va = (float) videoW / videoH, pa = (float) pw / ph;
        int w, h;
        if ("fill".equals(aspectMode)) {
            surface.setLayoutParams(new FrameLayout.LayoutParams(pw, ph, Gravity.CENTER));
            return;
        }
        if (aspectMode.startsWith("box:")) {
            // the live preview plays inside a frame on the page: "box:x,y,w,h" as fractions of the screen;
            // the picture keeps its proportions and is centred in the frame
            try {
                String[] p = aspectMode.substring(4).split(",");
                int bx = Math.round(Float.parseFloat(p[0]) * pw), by = Math.round(Float.parseFloat(p[1]) * ph);
                int bw = Math.round(Float.parseFloat(p[2]) * pw), bh = Math.round(Float.parseFloat(p[3]) * ph);
                if (bw > 0 && bh > 0) {
                    if (va > (float) bw / bh) { w = bw; h = Math.round(bw / va); }
                    else { h = bh; w = Math.round(bh * va); }
                    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, Gravity.TOP | Gravity.LEFT);
                    lp.leftMargin = bx + (bw - w) / 2;
                    lp.topMargin = by + (bh - h) / 2;
                    surface.setLayoutParams(lp);
                    return;
                }
            } catch (Exception ignored) { }
        }
        if ("16:9".equals(aspectMode)) va = 16f / 9f;
        else if ("4:3".equals(aspectMode)) va = 4f / 3f;
        else if ("21:9".equals(aspectMode)) va = 21f / 9f;
        if ("zoom".equals(aspectMode)) {
            // cover the whole screen, keeping proportions; the overflow is cropped by the parent
            if (va > pa) {
                h = ph;
                w = Math.round(ph * va);
            } else {
                w = pw;
                h = Math.round(pw / va);
            }
        } else if (va > pa) {
            w = pw;
            h = Math.round(pw / va);
        } else {
            h = ph;
            w = Math.round(ph * va);
        }
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, Gravity.CENTER);
        surface.setLayoutParams(lp);
    }

    private void emit(String type, JSONObject data) {
        try {
            JSONObject ev = data == null ? new JSONObject() : data;
            ev.put("type", type);
            updateState();
            events.onPlayerEvent(ev);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = true;
        if (mp != null) {
            try {
                mp.setDisplay(holder);
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
        if (mp != null) {
            try {
                mp.setDisplay(null);
            } catch (Exception ignored) {
            }
        }
    }
}
