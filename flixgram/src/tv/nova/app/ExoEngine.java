package tv.nova.app;

import android.content.Context;
import android.view.SurfaceView;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.text.Cue;
import androidx.media3.common.text.CueGroup;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.SeekParameters;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.mp4.Mp4Extractor;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Fast-start video engine (ExoPlayer). It begins playing as soon as about half a second of video is in,
 * reads only the parts of the file it needs (header, index, the spot you jump to), and seeks to the nearest
 * key frame instantly. Telegram bytes come from the local StreamServer while they download.
 * Reports the same state / events as the MediaPlayer path so the page does not care which engine runs.
 */
final class ExoEngine {
    interface Host {
        void onExoEvent(String type, JSONObject data);
        void onExoVideoSize(int w, int h);
        /** The engine cannot open this file at all (e.g. an unsupported container): try the system player. */
        void onExoUnsupported(String url, int startMs);
    }

    private final Context ctx;
    private final SurfaceView surface;
    private final Host host;
    private ExoPlayer player;
    private String url;
    private int startMs;
    private boolean ready, everReady, muted, ended;
    private float speed = 1f;
    private int w, h;
    /** index -> (type, group, track) for the page's audio / subtitle menu */
    private final List<int[]> trackMap = new ArrayList<int[]>();
    private Tracks lastTracks;

    ExoEngine(Context ctx, SurfaceView surface, Host host) {
        this.ctx = ctx;
        this.surface = surface;
        this.host = host;
    }

    boolean active() { return player != null; }

    void play(String url, int startMs) {
        release();
        this.url = url;
        this.startMs = startMs;
        ready = everReady = ended = false;
        w = h = 0;

        DefaultExtractorsFactory extractors = new DefaultExtractorsFactory()
                .setConstantBitrateSeekingEnabled(true)
                .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES)
                .setMp4ExtractorFlags(Mp4Extractor.FLAG_WORKAROUND_IGNORE_EDIT_LISTS);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setConnectTimeoutMs(4000).setReadTimeoutMs(120000).setAllowCrossProtocolRedirects(true);
        // Start after ~0.5 s of picture; resume after a stall with 1.5 s in hand; keep 15–60 s ahead.
        DefaultLoadControl load = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 60000, 500, 1500)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(ctx)
                .setEnableDecoderFallback(true)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER);
        player = new ExoPlayer.Builder(ctx, renderers)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(http, extractors))
                .setLoadControl(load)
                .build();
        player.setSeekParameters(SeekParameters.CLOSEST_SYNC);
        player.setVideoSurfaceView(surface);
        player.setVolume(muted ? 0f : 1f);
        player.setPlaybackParameters(new PlaybackParameters(speed));
        // subtitles stay off until chosen in the menu
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    ready = true;
                    if (!everReady) {
                        everReady = true;
                        host.onExoEvent("prepared", tracksJson());
                        host.onExoEvent("rendering", null);
                    } else host.onExoEvent("ready", null);
                } else if (state == Player.STATE_BUFFERING) {
                    ready = false;
                    host.onExoEvent("buffering", null);
                } else if (state == Player.STATE_ENDED) {
                    ended = true;
                    host.onExoEvent("ended", null);
                }
            }

            @Override
            public void onPlayerError(PlaybackException e) {
                int code = e.errorCode;
                boolean format = code == PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED
                        || code == PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED
                        || code == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED
                        || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
                        || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES;
                if (format && !everReady) {
                    String u = ExoEngine.this.url;
                    int s = ExoEngine.this.startMs;
                    release();
                    host.onExoUnsupported(u, s);
                    return;
                }
                try {
                    host.onExoEvent("error", new JSONObject().put("what", code).put("message", e.getErrorCodeName()));
                } catch (Exception ignored) { }
            }

            @Override
            public void onVideoSizeChanged(VideoSize size) {
                if (size.width <= 0 || size.height <= 0) return;
                w = Math.round(size.width * (size.pixelWidthHeightRatio > 0 ? size.pixelWidthHeightRatio : 1f));
                h = size.height;
                host.onExoVideoSize(w, h);
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                lastTracks = tracks;
            }

            @Override
            public void onCues(CueGroup cues) {
                StringBuilder sb = new StringBuilder();
                for (Cue c : cues.cues) {
                    if (c.text == null) continue;
                    if (sb.length() > 0) sb.append('\n');
                    sb.append(c.text);
                }
                try {
                    host.onExoEvent("subtitle", new JSONObject().put("text", sb.toString()));
                } catch (Exception ignored) { }
            }
        });
        player.setMediaItem(MediaItem.fromUri(url), startMs > 0 ? startMs : 0);
        player.setPlayWhenReady(true);
        player.prepare();
    }

    private JSONObject tracksJson() {
        JSONObject o = new JSONObject();
        trackMap.clear();
        try {
            o.put("dur", player.getDuration() == C.TIME_UNSET ? 0 : player.getDuration());
            JSONArray arr = new JSONArray();
            Tracks t = player.getCurrentTracks();
            lastTracks = t;
            int audioSel = -1;
            List<Tracks.Group> groups = t.getGroups();
            for (int g = 0; g < groups.size(); g++) {
                Tracks.Group grp = groups.get(g);
                int type = grp.getType();
                if (type != C.TRACK_TYPE_AUDIO && type != C.TRACK_TYPE_TEXT) continue;
                for (int i = 0; i < grp.length; i++) {
                    if (!grp.isTrackSupported(i)) continue;
                    Format f = grp.getTrackFormat(i);
                    int index = trackMap.size();
                    trackMap.add(new int[]{type, g, i});
                    JSONObject j = new JSONObject();
                    j.put("index", index);
                    j.put("type", type == C.TRACK_TYPE_AUDIO ? "audio" : "text");
                    j.put("lang", f.language == null ? "und" : f.language);
                    arr.put(j);
                    if (type == C.TRACK_TYPE_AUDIO && grp.isTrackSelected(i)) audioSel = index;
                }
            }
            o.put("tracks", arr);
            o.put("audioSel", audioSel);
            o.put("textSel", -1);
        } catch (Exception ignored) { }
        return o;
    }

    void selectTrack(int index, boolean select) {
        if (player == null || index < 0 || index >= trackMap.size()) return;
        int[] m = trackMap.get(index);
        try {
            Tracks.Group grp = player.getCurrentTracks().getGroups().get(m[1]);
            if (m[0] == C.TRACK_TYPE_TEXT && !select) {
                player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
                return;
            }
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                    .setTrackTypeDisabled(m[0], false)
                    .setOverrideForType(new TrackSelectionOverride(grp.getMediaTrackGroup(), m[2]))
                    .build());
        } catch (Exception ignored) { }
    }

    void pause() { if (player != null) player.setPlayWhenReady(false); }

    void resume() {
        if (player == null) return;
        if (ended) { ended = false; player.seekTo(0); }
        player.setPlayWhenReady(true);
    }

    void seek(int ms) { if (player != null) { ended = false; player.seekTo(Math.max(0, ms)); } }

    void setSpeed(float s) {
        speed = s;
        if (player != null) player.setPlaybackParameters(new PlaybackParameters(s));
    }

    void setMuted(boolean m) {
        muted = m;
        if (player != null) player.setVolume(m ? 0f : 1f);
    }

    String state() {
        try {
            JSONObject o = new JSONObject();
            o.put("active", player != null);
            if (player != null) {
                o.put("prepared", everReady);
                o.put("buffering", !ready && !ended);
                long pos = player.getCurrentPosition(), dur = player.getDuration();
                o.put("pos", pos);
                o.put("dur", dur == C.TIME_UNSET ? 0 : dur);
                o.put("playing", player.isPlaying());
                o.put("speed", speed);
                o.put("muted", muted);
                o.put("w", w);
                o.put("h", h);
            }
            return o.toString();
        } catch (Exception e) {
            return "{\"active\":false}";
        }
    }

    void release() {
        if (player != null) {
            try { player.release(); } catch (Exception ignored) { }
            player = null;
        }
        ready = everReady = false;
        trackMap.clear();
    }
}
