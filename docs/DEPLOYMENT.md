# نشر Football Agent على GitHub Pages

## تفعيل النشر مرة واحدة

1. افتح إعدادات المستودع: https://github.com/GeKa121111/football-agent/settings/pages
2. من **Build and deployment** اجعل **Source** = **GitHub Actions**.
3. احفظ الإعداد إن ظهر زر للحفظ.

## النشر التلقائي

بعد دمج إعداد النشر في فرع `main`، سيعمل Workflow تلقائيًا عند كل تحديث على `main`. كما يمكن تشغيله يدويًا من تبويب Actions عبر **Deploy Football Agent to GitHub Pages**.

## رابط اللعبة المتوقع

https://geka121111.github.io/football-agent/

لن يصبح الرابط متاحًا للعب إلا بعد نجاح أول تشغيل للنشر. افتحه في Chrome بعد ظهور نجاح مهمة **Deploy to GitHub Pages** في تبويب Actions.

## بوابة جودة النشر

لا يكفي نجاح اختبارات الوحدة وحدها للسماح بالنشر. يجب أن ينجح Workflow النشر في جميع الخطوات التالية قبل رفع Artifact إلى GitHub Pages:

1. تثبيت الاعتماديات.
2. تثبيت Chromium وملحقات المتصفح المطلوبة.
3. تشغيل اختبارات الوحدة عبر `npm test`.
4. تشغيل اختبارات المتصفح لسطح المكتب والموبايل عبر `npm run test:e2e`.
5. فحص الصياغة عبر `npm run check`.
6. بناء نسخة الإنتاج بمسار GitHub Pages الصحيح.

أي فشل في هذه الخطوات يمنع تنفيذ وظيفة النشر؛ وظيفة `deploy` تعتمد على نجاح وظيفة `build` بالكامل.
