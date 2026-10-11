package tv.nova.app;

/** Phone-side page served on the LAN during first-time setup. */
final class SetupPage {
    private static final String LOGO = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300' width='64' height='64' style='display:block;margin-bottom:18px'><defs><linearGradient id='beam' x1='0' x2='1'><stop offset='0' stop-color='#fff3dd' stop-opacity='1'/><stop offset='.55' stop-color='#ffd9b0' stop-opacity='.75'/><stop offset='1' stop-color='#ff9a6a' stop-opacity='.25'/></linearGradient><radialGradient id='room' cx='.28' cy='.3' r='.75'><stop offset='0' stop-color='#ff8a4c' stop-opacity='.55'/><stop offset='.45' stop-color='#9c3b8a' stop-opacity='.28'/><stop offset='1' stop-color='#0e0b14' stop-opacity='0'/></radialGradient><filter id='bl' x='-100%' y='-100%' width='300%' height='300%'><feGaussianBlur stdDeviation='12'/></filter><clipPath id='tile'><rect width='300' height='300' rx='66'/></clipPath></defs><g clip-path='url(#tile)'><rect width='300' height='300' fill='#0e0b14'/><rect width='300' height='300' fill='url(#room)'/><path d='M66 150 L250 62 Q262 57 262 70 L262 230 Q262 243 250 238 Z' fill='url(#beam)'/><circle cx='66' cy='150' r='30' fill='#fff3dd' filter='url(#bl)' opacity='.9'/><circle cx='66' cy='150' r='19' fill='#fff3dd'/><path d='M172 116 Q166 112 166 120 L166 180 Q166 188 172 184 L216 156 Q222 150 216 144 Z' fill='#0e0b14'/></g></svg>";

    private SetupPage() {
    }

    static String html(String mode) {
        String body;
        if ("done".equals(mode)) {
            body = "<div class=card ok><div class=big>✓</div><h1>מעולה, קיבלנו!</h1><p>הטלוויזיה ממשיכה מכאן. אפשר לסגור את הדף.</p></div>";
        } else {
            String err = "error".equals(mode) ? "<p class=err>הפרטים לא תקינים. ‏api_id הוא מספר, ו‑api_hash הוא 32 תווים.</p>" : "";
            body = "<div class=card>" + LOGO + "<h1>חיבור Flixgram לטלגרם</h1>"
                    + "<ol><li>היכנסו ל־<a href='https://my.telegram.org/apps' target=_blank>my.telegram.org</a> עם המספר שלכם</li>"
                    + "<li>בחרו <b>API development tools</b> וצרו אפליקציה (שם כלשהו)</li>"
                    + "<li>העתיקו לכאן את <b>App api_id</b> ו־<b>App api_hash</b></li></ol>" + err
                    + "<form method=post><label>api_id<input name=api_id inputmode=numeric autocomplete=off required></label>"
                    + "<label>api_hash<input name=api_hash autocomplete=off autocapitalize=off spellcheck=false required></label>"
                    + "<button>שליחה לטלוויזיה</button></form></div>";
        }
        return "<!doctype html><html dir=rtl lang=he><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<title>Flixgram · Setup</title><style>"
                + "*{box-sizing:border-box}body{margin:0;min-height:100vh;font:16px/1.5 system-ui,-apple-system,Segoe UI,Rubik,sans-serif;"
                + "background:#06070a;color:#f2f1ee;display:flex;align-items:center;justify-content:center;padding:20px;"
                + "background-image:radial-gradient(120% 60% at 50% -10%,rgba(255,138,76,.32),transparent 60%)}"
                + ".card{width:100%;max-width:440px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:28px}"
                + ".dot{width:14px;height:14px;border-radius:50%;background:#ffb27a;box-shadow:0 0 24px #ffb27a;margin-bottom:18px}"
                + "h1{font-size:24px;margin:0 0 12px;letter-spacing:-.01em}ol{padding-inline-start:20px;color:#bdbab3;margin:0 0 18px}li{margin:6px 0}"
                + "a{color:#ffc39a}label{display:block;font-size:13px;color:#9a978f;margin:14px 0 0;direction:ltr;text-align:left}"
                + "input{display:block;width:100%;margin-top:6px;padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.14);"
                + "background:rgba(0,0,0,.4);color:#fff;font:16px ui-monospace,Menlo,monospace;direction:ltr}"
                + "input:focus{outline:none;border-color:#ffb27a}button{margin-top:22px;width:100%;padding:16px;border:0;border-radius:999px;"
                + "background:#ffb27a;color:#1a0d06;font-weight:700;font-size:17px}.err{color:#ff8a8a}.ok{text-align:center}.big{font-size:56px;color:#ffb27a}"
                + "</style></head><body>" + body + "</body></html>";
    }
}
