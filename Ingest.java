// استخراج نص الكتب بالـ OCR: java Ingest.java   (محتاج Tesseract مع لغة ara + poppler-utils). بيكمّل من حيث وقف.
import java.io.*; import java.nio.charset.StandardCharsets; import java.nio.file.*; import java.util.*;

public class Ingest {
  static String run(String... cmd) throws Exception {
    Process p = new ProcessBuilder(cmd).redirectError(ProcessBuilder.Redirect.DISCARD).start();
    String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8); p.waitFor(); return out;
  }
  public static void main(String[] a) throws Exception {
    String[][] books = {{"arabic","اللغة العربية (الأضواء)","الاضواء_عربي_1ث.pdf","ara"},{"history","التاريخ (الامتحان)","الامتحان_تاريخ_1ث.pdf","ara"},
      {"philosophy","الفلسفة (الامتحان)","الامتحان_فلسفه_1ث.pdf","ara"},{"technology","التكنولوجيا (فائز)","فائز_تكنولجيا_1ث.pdf","ara+eng"},
      {"english","English (المعاصر)","المعاصر_انجليزي_1ث.pdf","eng"}};
    Path out = Path.of("data/pages.tsv"); Files.createDirectories(out.getParent());
    Set<String> done = new HashSet<>();
    if (Files.exists(out)) for (String l : Files.readAllLines(out)) { String[] p = l.split("\t",4); if (p.length > 3) done.add(p[0] + "/" + p[2]); }
    try (BufferedWriter w = Files.newBufferedWriter(out, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
      for (String[] b : books) {
        Path pdf = Path.of("pdfs", b[2]); if (!Files.exists(pdf)) { System.out.println("مش لاقي " + pdf); continue; }
        int n = 0; for (String l : run("pdfinfo", pdf.toString()).split("\n")) if (l.startsWith("Pages:")) n = Integer.parseInt(l.substring(6).trim());
        for (int p = 1; p <= n; p++) {
          if (done.contains(b[0] + "/" + p)) continue;
          run("pdftoppm","-f",""+p,"-l",""+p,"-r","130","-gray","-png","-singlefile",pdf.toString(),"tmp_page");
          String t = run("tesseract","tmp_page.png","stdout","-l",b[3],"--psm","6").replaceAll("[\\t\\r\\n]+"," ").trim();
          w.write(b[0] + "\t" + b[1] + "\t" + p + "\t" + t + "\n"); w.flush();
          System.out.println(b[1] + " " + p + "/" + n);
        }
      }
    }
    Files.deleteIfExists(Path.of("tmp_page.png")); System.out.println("خلص");
  }
}
