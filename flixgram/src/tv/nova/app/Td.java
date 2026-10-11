package tv.nova.app;

import android.util.Log;

import org.json.JSONObject;

import java.nio.charset.Charset;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Thin wrapper over TDLib's JSON interface (libtdjson.so) via a tiny JNI shim.
 * One TDLib client per process. Responses to requests made from Java carry an
 * "@extra" starting with "j:" and are consumed here; everything else is
 * forwarded to the listener (the WebView UI).
 */
public final class Td {
    private static final String TAG = "NovaTd";
    static final Charset UTF8 = Charset.forName("UTF-8");

    static {
        System.loadLibrary("tdjson");
        System.loadLibrary("novajni");
    }

    static native int nCreate();
    static native void nSend(int id, byte[] req);
    static native byte[] nReceive(double timeout);
    static native byte[] nExecute(byte[] req);

    public interface Listener {
        void onTdEvent(String json);
    }

    private static int clientId = -1;
    private static volatile Listener listener;
    private static Thread loop;
    private static final AtomicLong seq = new AtomicLong(1);
    private static final ConcurrentHashMap<String, Pending> pending = new ConcurrentHashMap<String, Pending>();

    private static final class Pending {
        final CountDownLatch latch = new CountDownLatch(1);
        volatile String result;
    }

    public interface FileListener {
        void onUpdateFile(JSONObject file);
    }

    private static volatile FileListener fileListener;

    static void setFileListener(FileListener l) {
        fileListener = l;
    }

    static synchronized void start(Listener l) {
        listener = l;
        if (clientId != -1) return;
        execute("{\"@type\":\"setLogVerbosityLevel\",\"new_verbosity_level\":1}");
        clientId = nCreate();
        loop = new Thread(new Runnable() {
            @Override
            public void run() {
                receiveLoop();
            }
        }, "td-receive");
        loop.setDaemon(true);
        loop.start();
        // Kick the client so it starts emitting authorization updates.
        send("{\"@type\":\"getOption\",\"name\":\"version\",\"@extra\":\"boot\"}");
    }

    /** After authorizationStateClosed (log out) the client is dead; spin up a fresh one. */
    static synchronized void restart() {
        clientId = nCreate();
        send("{\"@type\":\"getOption\",\"name\":\"version\",\"@extra\":\"boot\"}");
    }

    static void setListener(Listener l) {
        listener = l;
    }

    private static void receiveLoop() {
        while (true) {
            byte[] raw;
            try {
                raw = nReceive(2.0);
            } catch (Throwable t) {
                Log.e(TAG, "receive failed", t);
                try { Thread.sleep(200); } catch (InterruptedException ignored) { }
                continue;
            }
            if (raw == null) continue;
            String s = new String(raw, UTF8);
            try {
                dispatch(s);
            } catch (Throwable t) {
                Log.e(TAG, "dispatch failed", t);
            }
        }
    }

    private static void dispatch(String s) throws Exception {
        int ex = s.indexOf("\"@extra\":\"j:");
        if (ex >= 0) {
            int start = ex + 10;
            int end = s.indexOf('"', start);
            String key = s.substring(start, end);
            Pending p = pending.remove(key);
            if (p != null) {
                p.result = s;
                p.latch.countDown();
            }
            return;
        }
        if (s.startsWith("{\"@type\":\"updateFile\"")) {
            FileListener fl = fileListener;
            if (fl != null) {
                JSONObject o = new JSONObject(s);
                fl.onUpdateFile(o.getJSONObject("file"));
            }
        }
        if (s.startsWith("{\"@type\":\"updateFile") || s.startsWith("{\"@type\":\"updateUserStatus\"")
                || s.startsWith("{\"@type\":\"updateChatAction\"") || s.startsWith("{\"@type\":\"updateOption\"")
                || s.startsWith("{\"@type\":\"updateStory")) {
            return; // the UI never needs these; keep the bridge quiet during streaming
        }
        Listener l = listener;
        if (l != null) l.onTdEvent(s);
    }

    static void send(String json) {
        if (clientId == -1) return;
        nSend(clientId, zeroTerminated(json));
    }

    static String execute(String json) {
        byte[] r = nExecute(zeroTerminated(json));
        return r == null ? null : new String(r, UTF8);
    }

    /** Synchronous request from a background thread. Returns null on timeout. */
    static JSONObject request(JSONObject req, long timeoutMs) {
        String key = "j:" + seq.getAndIncrement();
        Pending p = new Pending();
        pending.put(key, p);
        try {
            req.put("@extra", key);
            send(req.toString());
            if (!p.latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
                pending.remove(key);
                return null;
            }
            return new JSONObject(p.result);
        } catch (Exception e) {
            pending.remove(key);
            return null;
        }
    }

    private static byte[] zeroTerminated(String s) {
        byte[] b = s.getBytes(UTF8);
        byte[] out = new byte[b.length + 1];
        System.arraycopy(b, 0, out, 0, b.length);
        return out;
    }
}
