# مساعد المذاكرة (Java + HTML + CSS)
محتاج Java 17+ فقط. من مجلد المشروع:
1. حط الـ 5 PDF بأسمائهم الأصلية في `pdfs/`.
2. استخراج النص (مرة واحدة، بياخد ساعات): ثبّت Tesseract (مع لغة ara) وpoppler ثم `java Ingest.java` (بيكمّل من حيث وقف).
3. شغّل الموقع: Windows: `set ANTHROPIC_API_KEY=مفتاحك` ثم `java Server.java` — Mac/Linux: `ANTHROPIC_API_KEY=مفتاحك java Server.java`
4. افتح http://localhost:3000
.
