package tv.nova.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity implements Td.Listener, Player.Events, StreamServer.SetupListener {
    private static final String TAG = "Nova";

    private WebView web;
    private Player player;
    private StreamServer server;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Object qLock = new Object();
    private ArrayList<String> queue = new ArrayList<String>();
    private boolean flushScheduled;
    private volatile boolean jsReady;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.BLACK));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        SurfaceView surface = new SurfaceView(this);
        surface.setFocusable(false);
        root.addView(surface, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= 23) s.setOffscreenPreRaster(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 21) s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        if (Build.VERSION.SDK_INT >= 23) s.setOffscreenPreRaster(true); // smoother scrolling: raster ahead of time
        s.setRenderPriority(WebSettings.RenderPriority.HIGH);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d("NovaJS", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "NovaHost");
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        hideSystemUi();

        player = new Player(root, surface, this);
        server = new StreamServer();
        try {
            server.start();
        } catch (Exception e) {
            Log.e(TAG, "server", e);
        }
        server.setSetupListener(this);
        Td.start(this);
        Td.setListener(this);

        web.loadUrl("file:///android_asset/web/index.html");
        web.requestFocus();
    }

    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 19) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    // ---------------------------------------------------------------- Td -> JS

    @Override
    public void onTdEvent(String json) {
        synchronized (qLock) {
            queue.add(json);
            if (!jsReady || flushScheduled) return;
            flushScheduled = true;
        }
        main.postDelayed(flush, 16);
    }

    private final Runnable flush = new Runnable() {
        @Override
        public void run() {
            ArrayList<String> batch;
            synchronized (qLock) {
                flushScheduled = false;
                if (queue.isEmpty() || web == null) return;
                batch = queue;
                queue = new ArrayList<String>();
            }
            StringBuilder sb = new StringBuilder(4096);
            sb.append("window.__td&&window.__td([");
            for (int i = 0; i < batch.size(); i++) {
                if (i > 0) sb.append(',');
                sb.append(batch.get(i));
            }
            sb.append("])");
            web.evaluateJavascript(sb.toString(), null);
        }
    };

    @Override
    public void onPlayerEvent(final JSONObject ev) {
        main.post(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript("window.__player&&window.__player(" + ev.toString() + ")", null);
            }
        });
    }

    @Override
    public void onSetup(final String apiId, final String apiHash) {
        main.post(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject o = new JSONObject().put("api_id", apiId).put("api_hash", apiHash);
                    if (web != null) web.evaluateJavascript("window.__setup&&window.__setup(" + o.toString() + ")", null);
                } catch (Exception ignored) {
                }
            }
        });
    }

    // ---------------------------------------------------------------- keys

    private void jsKey(String name) {
        web.evaluateJavascript("window.NOVA&&NOVA.key('" + name + "')", null);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        String media = null;
        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: media = "playpause"; break;
            case KeyEvent.KEYCODE_MEDIA_PLAY: media = "play"; break;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: media = "pause"; break;
            case KeyEvent.KEYCODE_MEDIA_STOP: media = "stop"; break;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: media = "ff"; break;
            case KeyEvent.KEYCODE_MEDIA_REWIND: media = "rw"; break;
            case KeyEvent.KEYCODE_MEDIA_NEXT: media = "next"; break;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: media = "prev"; break;
            case KeyEvent.KEYCODE_CHANNEL_UP: media = "chup"; break;
            case KeyEvent.KEYCODE_CHANNEL_DOWN: media = "chdown"; break;
            case KeyEvent.KEYCODE_MENU: media = "menu"; break;
            case KeyEvent.KEYCODE_INFO: media = "info"; break;
            case KeyEvent.KEYCODE_SEARCH: media = "search"; break;
            case KeyEvent.KEYCODE_PROG_RED: media = "red"; break;
            case KeyEvent.KEYCODE_MUTE: media = "mute"; break;
            default: break;
        }
        if (media != null) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) jsKey(media);
            return true;
        }
        if (code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_ESCAPE) {
            if (e.getAction() == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.NOVA?String(NOVA.back()):'nojs'", new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if (v == null || v.contains("nojs")) finish();
                    }
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("window.NOVA&&NOVA.lifecycle('resume')", null);
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.evaluateJavascript("window.NOVA&&NOVA.lifecycle('pause')", null);
        if (player != null) player.pause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (player != null) player.release();
        if (server != null) server.stop();
        Td.setListener(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    // ---------------------------------------------------------------- JS bridge

    public final class Bridge {
        @JavascriptInterface
        public void send(String json) {
            Td.send(json);
        }

        @JavascriptInterface
        public void restart() {
            Td.restart();
        }

        @JavascriptInterface
        public String execute(String json) {
            return Td.execute(json);
        }

        @JavascriptInterface
        public void ready() {
            synchronized (qLock) {
                jsReady = true;
                flushScheduled = true;
            }
            main.post(flush);
        }

        @JavascriptInterface
        public String info() {
            try {
                Context c = MainActivity.this;
                File db = new File(c.getFilesDir(), "td-db");
                File files = new File(c.getCacheDir(), "td-files");
                db.mkdirs();
                files.mkdirs();
                String ver = "1.0";
                try {
                    PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
                    ver = pi.versionName;
                } catch (Exception ignored) {
                }
                JSONObject o = new JSONObject();
                o.put("port", server.port());
                o.put("lan", StreamServer.lanAddress());
                o.put("token", server.token);
                o.put("db", db.getAbsolutePath());
                o.put("files", files.getAbsolutePath());
                o.put("model", (Build.MANUFACTURER + " " + Build.MODEL).trim());
                o.put("system", "Android " + Build.VERSION.RELEASE);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("version", ver);
                o.put("lang", Locale.getDefault().getLanguage());
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void play(final String url, final int startMs) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    StreamServer.bumpEpoch();
                    player.play(url, startMs);
                }
            });
        }

        @JavascriptInterface
        public void pause() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    player.pause();
                }
            });
        }

        @JavascriptInterface
        public void resume() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    player.resume();
                }
            });
        }

        @JavascriptInterface
        public void seek(final int ms) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    player.seek(ms);
                }
            });
        }

        @JavascriptInterface
        public void speed(final float s) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    player.setSpeed(s);
                }
            });
        }

        @JavascriptInterface
        public void track(final int index, final boolean select) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    player.selectTrack(index, select);
                }
            });
        }

        @JavascriptInterface
        public void mute(final boolean on) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    player.setMuted(on);
                }
            });
        }

        @JavascriptInterface
        public void prefetch(final int fileId, final int bytes) {
            StreamServer.prefetch(fileId, bytes);
        }

        @JavascriptInterface
        public void stop() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    player.release();
                    StreamServer.bumpEpoch();
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public String state() {
            return player.state();
        }

        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void exit() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
