// تشغيل: java Server.java   (محتاج Java 17+ ومتغير ANTHROPIC_API_KEY)
import com.sun.net.httpserver.*;
import java.io.*; import java.net.*; import java.net.http.*;
import java.nio.charset.StandardCharsets; import java.nio.file.*; import java.util.*;

public class Server {
  record Page(String id, String book, int page, String text, Map<String,Integer> tf, int len) {}
  static List<Page> pages = new ArrayList<>(); static Map<String,Integer> df = new HashMap<>(); static double avg = 1;
  static final Map<String,String> FILES = Map.of("arabic","الاضواء_عربي_1ث.pdf","history","الامتحان_تاريخ_1ث.pdf",
    "philosophy","الامتحان_فلسفه_1ث.pdf","technology","فائز_تكنولجيا_1ث.pdf","english","المعاصر_انجليزي_1ث.pdf");
  static final String KEY = System.getenv("ANTHROPIC_API_KEY"), MODEL = System.getenv().getOrDefault("MODEL","claude-sonnet-5");
  static final String SYSTEM = """
    أنت مدرّس ذكي لطلاب الصف الأول الثانوي. هتاخد مقاطع من كتبهم (نص مستخرج بـ OCR وممكن يكون فيه أخطاء).
    - جاوب اعتمادًا على المقاطع، واذكر المصدر: (اسم الكتاب - صفحة X).
    - لو السؤال اختيار من متعدد، اذكر الإجابة الصحيحة وبعدين اشرح ليه.
    - لو الطالب قال إنه مش فاهم، اشرح بأسلوب بسيط وبأمثلة وخطوة خطوة.
    - لو النص مش واضح بسبب الـ OCR قول كده، ولو الإجابة مش في المقاطع قول إنها مش في الكتب. متخترعش إجابة.
    - رد بنفس لغة الطالب.""";

  static String norm(String s) {
    s = s.replaceAll("[\\u064B-\\u0652\\u0640]","").replaceAll("[إأآٱ]","ا").replace('ى','ي').replace('ة','ه').toLowerCase();
    for (int i = 0; i < 10; i++) s = s.replace((char)('٠'+i),(char)('0'+i));
    return s;
  }
  static List<String> tok(String s) {
    List<String> r = new ArrayList<>();
    for (String w : norm(s).split("[^a-z0-9\\u0621-\\u064A]+")) if (w.length() > 1) r.add(w.replaceFirst("^(وال|بال|كال|فال|لل|ال)",""));
    return r;
  }
  static void load() throws IOException {
    Path f = Path.of("data/pages.tsv"); if (!Files.exists(f)) return;
    for (String l : Files.readAllLines(f)) {
      String[] p = l.split("\t",4); if (p.length < 4 || p[3].length() < 20) continue;
      String text = p[3].replaceAll("https?://\\S+","").trim(); Map<String,Integer> tf = new HashMap<>(); List<String> t = tok(text);
      for (String w : t) tf.merge(w,1,Integer::sum);
      tf.keySet().forEach(w -> df.merge(w,1,Integer::sum));
      pages.add(new Page(p[0],p[1],Integer.parseInt(p[2]),text,tf,t.size()));
    }
    avg = pages.stream().mapToInt(Page::len).average().orElse(1);
    System.out.println("تم تحميل " + pages.size() + " صفحة");
  }
  static List<Page> search(String q, String book) {
    List<String> qt = tok(q); int n = pages.size(); Map<Page,Double> sc = new HashMap<>();
    for (Page p : pages) {
      if (!book.isEmpty() && !p.id().equals(book)) continue; double s = 0;
      for (String w : qt) { Integer f = p.tf().get(w); if (f == null) continue; int d = df.get(w);
        s += Math.log(1 + (n-d+.5)/(d+.5)) * f * 2.2 / (f + 1.2*(.25 + .75*p.len()/avg)); }
      if (s > 0) sc.put(p,s);
    }
    return sc.entrySet().stream().sorted((a,b)->Double.compare(b.getValue(),a.getValue())).limit(6).map(Map.Entry::getKey).toList();
  }
  static String js(String s) {
    StringBuilder b = new StringBuilder();
    for (char c : s.toCharArray()) switch (c) { case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\"); case '\n' -> b.append("\\n");
      case '\r' -> {} case '\t' -> b.append(' '); default -> { if (c < 32) b.append(' '); else b.append(c); } }
    return b.toString();
  }
  static String field(String body, String key) {
    int i = body.indexOf("\"" + key + "\":\""); if (i < 0) return null; i += key.length() + 4; StringBuilder sb = new StringBuilder();
    for (; i < body.length(); i++) { char c = body.charAt(i); if (c == '"') break;
      if (c == '\\') { char n = body.charAt(++i);
        switch (n) { case 'n' -> sb.append('\n'); case 't' -> sb.append('\t'); case 'u' -> { sb.append((char)Integer.parseInt(body.substring(i+1,i+5),16)); i += 4; } default -> sb.append(n); }
      } else sb.append(c); }
    return sb.toString();
  }
  static String ask(String q, String prev, List<Page> hits) throws Exception {
    if (KEY == null || KEY.isBlank()) return "⚠️ لازم تضبط متغير ANTHROPIC_API_KEY قبل تشغيل السيرفر.";
    StringBuilder ctx = new StringBuilder();
    for (Page p : hits) ctx.append("[").append(p.book()).append(" - صفحة ").append(p.page()).append("]\n").append(p.text(), 0, Math.min(2000,p.text().length())).append("\n\n---\n\n");
    if (hits.isEmpty()) ctx.append("(مفيش مقاطع مطابقة)");
    String user = (prev.isBlank() ? "" : "المحادثة السابقة:\n" + prev + "\n\n") + "المقاطع من الكتب:\n" + ctx + "\nسؤال الطالب: " + q;
    String json = "{\"model\":\"" + MODEL + "\",\"max_tokens\":1500,\"system\":\"" + js(SYSTEM) + "\",\"messages\":[{\"role\":\"user\",\"content\":\"" + js(user) + "\"}]}";
    HttpResponse<String> r = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("https://api.anthropic.com/v1/messages"))
      .header("content-type","application/json").header("x-api-key",KEY).header("anthropic-version","2023-06-01")
      .POST(HttpRequest.BodyPublishers.ofString(json)).build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    String t = field(r.body(), r.statusCode() == 200 ? "text" : "message");
    return t != null ? t : "حصل خطأ من الـ API: " + r.body();
  }
  static String esc(String s) { return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;"); }

  static String html(String book, String q, String answer, List<Page> hits, String prev) {
    Map<String,String> names = new LinkedHashMap<>(); pages.forEach(p -> names.putIfAbsent(p.id(), p.book()));
    StringBuilder opts = new StringBuilder("<option value=''>كل الكتب</option>");
    names.forEach((id,n) -> opts.append("<option value='").append(id).append("'").append(id.equals(book) ? " selected" : "").append(">").append(esc(n)).append("</option>"));
    StringBuilder out = new StringBuilder();
    if (answer != null) {
      out.append("<div class='m u'>").append(esc(q)).append("</div><div class='m a'>").append(esc(answer)).append("<div class='src'>");
      for (Page p : hits) out.append("<a target='_blank' href='/pdf/").append(p.id()).append("#page=").append(p.page()).append("'>").append(esc(p.book())).append(" - ص").append(p.page()).append("</a>");
      out.append("</div></div>");
    } else out.append("<div class='m a'>أهلًا! اكتب سؤالك أو سؤال الامتحان وأنا أجاوب وأشرحه من الكتب. لو مش فاهم قولي «اشرحلي» 👋</div>");
    return "<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>مساعد المذاكرة</title>"
      + "<link rel='stylesheet' href='/style.css'></head><body><header><h1>📚 مساعد المذاكرة - أول ثانوي</h1></header><main>" + out + "</main>"
      + "<form method='post' action='/ask'><select name='book'>" + opts + "</select><input type='hidden' name='prev' value='" + esc(prev) + "'>"
      + "<textarea name='q' rows='3' placeholder='اكتب سؤالك هنا...' required></textarea><button>إرسال</button></form></body></html>";
  }
  static void send(HttpExchange x, int code, String type, byte[] b) throws IOException {
    x.getResponseHeaders().set("Content-Type", type); x.sendResponseHeaders(code, b.length); try (OutputStream o = x.getResponseBody()) { o.write(b); }
  }
  public static void main(String[] a) throws Exception {
    load();
    HttpServer s = HttpServer.create(new InetSocketAddress(Integer.parseInt(System.getenv().getOrDefault("PORT","3000"))), 0);
    s.createContext("/", x -> {
      try {
        String path = x.getRequestURI().getPath(); String H = "text/html;charset=utf-8";
        if (path.equals("/")) send(x,200,H,html("","",null,List.of(),"").getBytes(StandardCharsets.UTF_8));
        else if (path.equals("/style.css")) send(x,200,"text/css;charset=utf-8",Files.readAllBytes(Path.of("style.css")));
        else if (path.equals("/ask") && x.getRequestMethod().equals("POST")) {
          Map<String,String> f = new HashMap<>();
          for (String kv : new String(x.getRequestBody().readAllBytes(), StandardCharsets.UTF_8).split("&")) { String[] p = kv.split("=",2); if (p.length == 2) f.put(p[0], URLDecoder.decode(p[1], StandardCharsets.UTF_8)); }
          String q = f.getOrDefault("q","").trim(), book = f.getOrDefault("book",""), prev = f.getOrDefault("prev","");
          List<Page> hits = search(q + " " + prev, book); String ans = ask(q, prev, hits);
          String np = (prev + "\nالطالب: " + q + "\nالمدرّس: " + ans); np = np.substring(Math.max(0, np.length() - 3000));
          send(x,200,H,html(book,q,ans,hits,np).getBytes(StandardCharsets.UTF_8));
        } else if (path.startsWith("/pdf/")) {
          Path f = Path.of("pdfs", FILES.getOrDefault(path.substring(5), "none"));
          if (!Files.exists(f)) send(x,404,H,"ضع ملف الـ PDF في مجلد pdfs".getBytes(StandardCharsets.UTF_8));
          else { x.getResponseHeaders().set("Content-Type","application/pdf"); x.sendResponseHeaders(200, Files.size(f)); try (OutputStream o = x.getResponseBody()) { Files.copy(f, o); } }
        } else send(x,404,H,"404".getBytes());
      } catch (Exception e) { e.printStackTrace(); send(x,500,"text/plain;charset=utf-8",("خطأ: " + e.getMessage()).getBytes(StandardCharsets.UTF_8)); }
    });
    s.start(); System.out.println("http://localhost:3000");
  }
}
