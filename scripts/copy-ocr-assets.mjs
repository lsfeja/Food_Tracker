// Copies the Tesseract.js worker, WASM core and DE/EN language data into public/ocr,
// so label OCR runs without third-party CDNs. Runs before `vite` and `vite build`.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = dirname(dirname(new URL(import.meta.url).pathname));
const target = join(root, "public", "ocr");
const packageDir = (name) => dirname(require.resolve(`${name}/package.json`));

const files = [
  [join(packageDir("tesseract.js"), "dist", "worker.min.js"), "worker.min.js"],
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((file) => [
    join(packageDir("tesseract.js-core"), file),
    file,
  ]),
  ...["deu", "eng"].map((lang) => [join(packageDir(`@tesseract.js-data/${lang}`), "4.0.0_best_int", `${lang}.traineddata.gz`), `${lang}.traineddata.gz`]),
];

mkdirSync(target, { recursive: true });
let copied = 0;
for (const [source, name] of files) {
  const destination = join(target, name);
  if (existsSync(destination) && statSync(destination).size === statSync(source).size) continue;
  copyFileSync(source, destination);
  copied++;
}
console.log(`OCR assets ready in public/ocr (${copied} copied, ${files.length - copied} up to date).`);
