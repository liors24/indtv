package tv.nova.app;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.media.TimedText;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

/** Native MediaPlayer rendering into a SurfaceView that sits behind the transparent WebView. */
final class Player implements SurfaceHolder.Callback {
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
    private int startAt;
    private float speed = 1f;
    private int videoW, videoH;
    private int session;

    private volatile String cachedState = "{\"active\":false}";

    Player(FrameLayout root, SurfaceView surface, Events events) {
        this.root = root;
        this.surface = surface;
        this.events = events;
        surface.getHolder().addCallback(this);
        main.post(ticker);
    }

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            updateState();
            main.postDelayed(this, 250);
        }
    };

    String state() {
        return cachedState;
    }

    private void updateState() {
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
                o.put("w", videoW);
                o.put("h", videoH);
            }
            cachedState = o.toString();
        } catch (Exception ignored) {
        }
    }

    void play(final String url, final int startMs) {
        release();
        final int my = ++session;
        prepared = false;
        buffering = true;
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
                    if (startAt > 0) p.seekTo(startAt);
                    applySpeed();
                    p.start();
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
        if (mp == null || !prepared) return;
        try {
            if (select) mp.selectTrack(index);
            else mp.deselectTrack(index);
        } catch (Exception e) {
            Log.w(TAG, "track", e);
        }
    }

    void pause() {
        if (mp != null && prepared && mp.isPlaying()) mp.pause();
        updateState();
    }

    void resume() {
        if (mp != null && prepared && !mp.isPlaying()) mp.start();
        updateState();
    }

    void seek(int ms) {
        if (mp == null || !prepared) {
            startAt = ms;
            return;
        }
        if (Build.VERSION.SDK_INT >= 26) mp.seekTo(ms, MediaPlayer.SEEK_PREVIOUS_SYNC);
        else mp.seekTo(ms);
        updateState();
    }

    void setSpeed(float s) {
        speed = s;
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

    private void layoutSurface() {
        int pw = root.getWidth(), ph = root.getHeight();
        if (pw == 0 || ph == 0 || videoW == 0 || videoH == 0) return;
        float va = (float) videoW / videoH, pa = (float) pw / ph;
        int w, h;
        if (va > pa) {
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
