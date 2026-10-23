package tv.nova.app;

import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URLDecoder;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Local HTTP server.
 *  /f/{fileId}?m=mime  -> progressive, range-capable stream of a Telegram file while it downloads
 *                         (loopback only). Bytes are pulled from TDLib on demand; nothing is kept
 *                         after playback (the UI deletes the file when the player closes).
 *  /t/{fileId}         -> small files (thumbnails, avatars, photos), downloaded synchronously (loopback only)
 *  /setup/{token}      -> one-time phone-friendly page to paste api_id / api_hash (LAN)
 */
final class StreamServer implements Td.FileListener {
    private static final String TAG = "NovaHttp";
    private static final int CHUNK = 512 * 1024;

    interface SetupListener {
        void onSetup(String apiId, String apiHash);
    }

    private ServerSocket server;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    final String token;
    private volatile SetupListener setupListener;

    /** Latest known state per file id. */
    private static final class FState {
        volatile String path = "";
        volatile long size;
        volatile long expected;
        volatile boolean complete;
        volatile long dlOffset;
        volatile long prefix;
        /** The newest reader steers TDLib's download window; older ones only wait (no tug-of-war). */
        volatile int owner;
        int seq;
        final Object lock = new Object();
    }

    /** Bumped whenever playback stops or changes: abandoned stream loops notice and exit. */
    private static volatile int epoch;

    static void bumpEpoch() {
        epoch++;
    }

    private final ConcurrentHashMap<Integer, FState> files = new ConcurrentHashMap<Integer, FState>();

    StreamServer() {
        byte[] b = new byte[6];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format(Locale.US, "%02x", x));
        token = sb.toString();
    }

    void setSetupListener(SetupListener l) {
        setupListener = l;
    }

    int start() throws IOException {
        server = new ServerSocket();
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress(0), 64);
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                acceptLoop();
            }
        }, "nova-http");
        t.setDaemon(true);
        t.start();
        Td.setFileListener(this);
        return server.getLocalPort();
    }

    int port() {
        return server == null ? 0 : server.getLocalPort();
    }

    void stop() {
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
        }
    }

    private void acceptLoop() {
        while (!server.isClosed()) {
            try {
                final Socket s = server.accept();
                pool.execute(new Runnable() {
                    @Override
                    public void run() {
                        handle(s);
                    }
                });
            } catch (IOException e) {
                if (server.isClosed()) return;
            }
        }
    }

    @Override
    public void onUpdateFile(JSONObject f) {
        int id = f.optInt("id");
        FState st = files.get(id);
        if (st == null) return;
        apply(st, f);
    }

    private static void apply(FState st, JSONObject f) {
        JSONObject local = f.optJSONObject("local");
        st.size = f.optLong("size");
        st.expected = f.optLong("expected_size");
        if (local != null) {
            String p = local.optString("path", "");
            if (p.length() > 0) st.path = p;
            st.complete = local.optBoolean("is_downloading_completed");
            st.dlOffset = local.optLong("download_offset");
            st.prefix = local.optLong("downloaded_prefix_size");
        }
        synchronized (st.lock) {
            st.lock.notifyAll();
        }
    }

    // ------------------------------------------------------------------ HTTP

    private void handle(Socket s) {
        try {
            s.setTcpNoDelay(true);
            s.setSoTimeout(60000);
            InputStream in = new BufferedInputStream(s.getInputStream());
            String requestLine = readLine(in);
            if (requestLine == null) return;
            Map<String, String> headers = new HashMap<String, String>();
            String line;
            while ((line = readLine(in)) != null && line.length() > 0) {
                int c = line.indexOf(':');
                if (c > 0) headers.put(line.substring(0, c).trim().toLowerCase(Locale.US), line.substring(c + 1).trim());
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String target = parts[1];
            String query = "";
            int q = target.indexOf('?');
            if (q >= 0) {
                query = target.substring(q + 1);
                target = target.substring(0, q);
            }
            OutputStream out = s.getOutputStream();
            boolean loopback = s.getInetAddress().isLoopbackAddress();

            if (target.startsWith("/f/") && loopback) {
                int id = Integer.parseInt(target.substring(3));
                String mime = param(query, "m");
                serveStream(s, in, out, id, mime == null ? "video/mp4" : mime, headers.get("range"), method.equals("HEAD"));
            } else if (target.startsWith("/t/") && loopback) {
                int id = Integer.parseInt(target.substring(3));
                serveSmall(out, id);
            } else if (target.equals("/setup/" + token)) {
                if (method.equals("POST")) {
                    int len = 0;
                    try { len = Integer.parseInt(headers.get("content-length")); } catch (Exception ignored) { }
                    byte[] body = new byte[Math.min(len, 8192)];
                    int r = 0;
                    while (r < body.length) {
                        int n = in.read(body, r, body.length - r);
                        if (n < 0) break;
                        r += n;
                    }
                    String form = new String(body, 0, r, Td.UTF8);
                    String apiId = cleanId(param(form, "api_id"));
                    String apiHash = cleanHash(param(form, "api_hash"));
                    boolean ok = apiId != null && apiId.trim().matches("\\d{3,12}") && apiHash != null && apiHash.trim().matches("[0-9a-fA-F]{32}");
                    if (ok && setupListener != null) setupListener.onSetup(apiId.trim(), apiHash.trim().toLowerCase(Locale.US));
                    sendHtml(out, SetupPage.html(ok ? "done" : "error"));
                } else {
                    sendHtml(out, SetupPage.html("form"));
                }
            } else {
                byte[] b = "not found".getBytes(Td.UTF8);
                out.write(("HTTP/1.1 404 Not Found\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes(Td.UTF8));
                out.write(b);
            }
            out.flush();
        } catch (Throwable e) {
            // client went away (seek / stop) – expected
        } finally {
            try { s.close(); } catch (IOException ignored) { }
        }
    }

    private static void sendHtml(OutputStream out, String html) throws IOException {
        byte[] b = html.getBytes(Td.UTF8);
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: "
                + b.length + "\r\nConnection: close\r\n\r\n").getBytes(Td.UTF8));
        out.write(b);
    }

    private static final String HE_KEYS = "שנבגקכעיןחלךצמםפ/רדאוהסטז";
    private static final String EN_KEYS = "abcdefghijklmnopqrstuvxyz";

    /** api_id: the number, without direction marks or words that came along with a paste. */
    static String cleanId(String s) {
        if (s == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\d{3,12}").matcher(s);
        String only = null;
        int count = 0;
        while (m.find()) { only = m.group(); count++; }
        if (count == 1) return only;
        return s.replaceAll("\\D", "");
    }

    /** api_hash: letters typed on a Hebrew keyboard become the English letters on the same keys. */
    static String cleanHash(String s) {
        if (s == null) return null;
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int k = HE_KEYS.indexOf(c);
            b.append(k >= 0 ? EN_KEYS.charAt(k) : Character.toLowerCase(c));
        }
        String t = b.toString();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("[0-9a-f]{32}").matcher(t);
        if (m.find()) return m.group();
        return t.replaceAll("[^0-9a-f]", "");
    }

    private static String param(String query, String name) {
        if (query == null) return null;
        for (String kv : query.split("&")) {
            int e = kv.indexOf('=');
            if (e > 0 && kv.substring(0, e).equals(name)) {
                try {
                    return URLDecoder.decode(kv.substring(e + 1), "UTF-8");
                } catch (Exception ex) {
                    return null;
                }
            }
        }
        return null;
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream(128);
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 8192) break;
        }
        if (c == -1 && b.size() == 0) return null;
        return new String(b.toByteArray(), Td.UTF8);
    }

    // ------------------------------------------------------------------ files

    private FState state(int id) {
        FState st = files.get(id);
        if (st == null) {
            st = new FState();
            FState prev = files.putIfAbsent(id, st);
            if (prev != null) return prev;
            try {
                JSONObject f = Td.request(new JSONObject().put("@type", "getFile").put("file_id", id), 15000);
                if (f != null && "file".equals(f.optString("@type"))) apply(st, f);
            } catch (Exception ignored) {
            }
        }
        return st;
    }

    /** Warm up the first bytes of a video the user is hovering, so playback starts instantly. */
    static void prefetch(int id, int bytes) {
        try {
            JSONObject r = new JSONObject();
            r.put("@type", "downloadFile");
            r.put("file_id", id);
            r.put("priority", 1);
            r.put("offset", 0);
            r.put("limit", bytes);
            r.put("synchronous", false);
            Td.send(r.toString());
        } catch (Exception ignored) {
        }
    }

    private static void startDownload(int id, long offset, int priority) {
        try {
            JSONObject r = new JSONObject();
            r.put("@type", "downloadFile");
            r.put("file_id", id);
            r.put("priority", priority);
            r.put("offset", offset);
            r.put("limit", 0);
            r.put("synchronous", false);
            Td.send(r.toString());
        } catch (Exception ignored) {
        }
    }

    private static long prefixAt(int id, long pos) {
        try {
            JSONObject r = Td.request(new JSONObject().put("@type", "getFileDownloadedPrefixSize").put("file_id", id).put("offset", pos), 5000);
            if (r == null) return 0;
            if (!"fileDownloadedPrefixSize".equals(r.optString("@type"))) return 0;
            return r.optLong("size");
        } catch (Exception e) {
            return 0;
        }
    }

    /** The player hung up (it seeks by opening a new connection): stop waiting for data on its behalf. */
    private static boolean clientGone(Socket s, InputStream in) {
        try {
            s.setSoTimeout(1);
            return in.read() == -1;
        } catch (SocketTimeoutException e) {
            return false;
        } catch (IOException e) {
            return true;
        } finally {
            try { s.setSoTimeout(60000); } catch (IOException ignored) { }
        }
    }

    private void serveStream(Socket sock, InputStream in, OutputStream out, int id, String mime, String range, boolean head) throws IOException {
        FState st = state(id);
        long total = st.size > 0 ? st.size : st.expected;
        long start = 0, end = total - 1;
        boolean partial = false;
        if (range != null && range.startsWith("bytes=")) {
            String r = range.substring(6);
            int dash = r.indexOf('-');
            try {
                String a = r.substring(0, dash).trim();
                String b = r.substring(dash + 1).trim();
                if (a.length() == 0 && b.length() > 0) { // suffix range
                    start = Math.max(0, total - Long.parseLong(b));
                } else {
                    start = Long.parseLong(a);
                    if (b.length() > 0) end = Math.min(Long.parseLong(b), total - 1);
                }
                partial = true;
            } catch (Exception ignored) {
            }
        }
        if (total <= 0) {
            out.write("HTTP/1.1 500 Unknown size\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".getBytes(Td.UTF8));
            return;
        }
        if (start >= total) {
            out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + total
                    + "\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").getBytes(Td.UTF8));
            return;
        }
        long len = end - start + 1;
        StringBuilder h = new StringBuilder();
        h.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
        h.append("Content-Type: ").append(mime).append("\r\n");
        h.append("Accept-Ranges: bytes\r\n");
        h.append("Content-Length: ").append(len).append("\r\n");
        if (partial) h.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(total).append("\r\n");
        h.append("Cache-Control: no-store\r\nConnection: close\r\n\r\n");
        out.write(h.toString().getBytes(Td.UTF8));
        if (head) return;

        final int myEpoch = epoch;
        final int me;
        synchronized (st.lock) { me = ++st.seq; st.owner = me; }
        startDownload(id, start, 32);
        long lastAim = System.currentTimeMillis();
        long lastProgress = System.currentTimeMillis();
        long lastAliveCheck = 0;
        byte[] buf = new byte[CHUNK];
        RandomAccessFile raf = null;
        String openPath = null;
        long pos = start;
        try {
            while (pos <= end) {
                if (myEpoch != epoch) return;
                if (System.currentTimeMillis() - lastProgress > 120000) return; // nobody is reading any more
                long avail;
                if (st.complete) avail = total - pos;
                else if (st.dlOffset <= pos && pos < st.dlOffset + st.prefix) avail = st.dlOffset + st.prefix - pos;   // known from file updates: no round trip
                else avail = prefixAt(id, pos);
                if (avail <= 0) {
                    long now = System.currentTimeMillis();
                    if (now - lastAliveCheck > 700) {
                        lastAliveCheck = now;
                        if (clientGone(sock, in)) return;
                    }
                    boolean mine = st.owner == me || st.owner == 0;
                    boolean covered = st.dlOffset <= pos && pos <= st.dlOffset + st.prefix + 2L * CHUNK;
                    if (mine && ((!covered && now - lastAim > 250) || (now - lastProgress > 4000 && now - lastAim > 4000))) {
                        if (st.owner == 0) st.owner = me;
                        startDownload(id, pos, 32);
                        lastAim = now;
                    }
                    synchronized (st.lock) {
                        try { st.lock.wait(120); } catch (InterruptedException e) { return; }
                    }
                    continue;
                }
                String p = st.path;
                if (p == null || p.length() == 0) {
                    synchronized (st.lock) {
                        try { st.lock.wait(60); } catch (InterruptedException e) { return; }
                    }
                    continue;
                }
                if (raf == null || !p.equals(openPath)) {
                    if (raf != null) try { raf.close(); } catch (IOException ignored) { }
                    raf = new RandomAccessFile(p, "r");
                    openPath = p;
                }
                int n = (int) Math.min(Math.min(avail, end - pos + 1), buf.length);
                raf.seek(pos);
                int read = raf.read(buf, 0, n);
                if (read <= 0) {
                    synchronized (st.lock) {
                        try { st.lock.wait(60); } catch (InterruptedException e) { return; }
                    }
                    continue;
                }
                out.write(buf, 0, read);
                pos += read;
                lastProgress = System.currentTimeMillis();
            }
        } finally {
            if (raf != null) try { raf.close(); } catch (IOException ignored) { }
            // let a reader that is still waiting take over the download window
            if (st.owner == me) st.owner = 0;
        }
    }

    private void serveSmall(OutputStream out, int id) throws IOException {
        String path = null;
        try {
            JSONObject r = new JSONObject();
            r.put("@type", "downloadFile");
            r.put("file_id", id);
            r.put("priority", 1);
            r.put("offset", 0);
            r.put("limit", 0);
            r.put("synchronous", true);
            JSONObject f = Td.request(r, 60000);
            if (f != null && "file".equals(f.optString("@type"))) {
                JSONObject local = f.optJSONObject("local");
                if (local != null && local.optBoolean("is_downloading_completed")) path = local.optString("path");
            }
        } catch (Exception ignored) {
        }
        if (path == null || path.length() == 0 || !new File(path).exists()) {
            out.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".getBytes(Td.UTF8));
            return;
        }
        File f = new File(path);
        long len = f.length();
        FileInputStream fis = new FileInputStream(f);
        try {
            byte[] head = new byte[12];
            int hn = fis.read(head);
            String type = sniff(head, hn);
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: " + type + "\r\nContent-Length: " + len
                    + "\r\nCache-Control: public, max-age=31536000, immutable\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n").getBytes(Td.UTF8));
            if (hn > 0) out.write(head, 0, hn);
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = fis.read(buf)) > 0) out.write(buf, 0, n);
        } finally {
            fis.close();
        }
    }

    private static String sniff(byte[] h, int n) {
        if (n >= 3 && (h[0] & 0xff) == 0xFF && (h[1] & 0xff) == 0xD8) return "image/jpeg";
        if (n >= 4 && (h[0] & 0xff) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return "image/png";
        if (n >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F' && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return "image/webp";
        if (n >= 4 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F') return "image/gif";
        return "application/octet-stream";
    }

    // ------------------------------------------------------------------ misc

    static String lanAddress() {
        try {
            String best = null;
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        String ip = a.getHostAddress();
                        String n = ni.getName();
                        if (n.startsWith("eth") || n.startsWith("wlan")) return ip;
                        if (best == null) best = ip;
                    }
                }
            }
            return best;
        } catch (Exception e) {
            Log.w(TAG, "no lan address", e);
            return null;
        }
    }

}
