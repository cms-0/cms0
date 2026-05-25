const fs = require("fs");
const path = require("path");

const cjsDir = path.join(__dirname, "dist", "cjs");

function renameJsToCjs(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      renameJsToCjs(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      const target = fullPath.slice(0, -3) + ".cjs";
      fs.renameSync(fullPath, target);
    }
  }
}

renameJsToCjs(cjsDir);

function rewriteCjsImports(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteCjsImports(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".cjs")) {
      const original = fs.readFileSync(fullPath, "utf8");
      const rewritten = original
        // require("./foo.js") -> require("./foo.cjs")
        .replace(/(require\(["'])(\.{1,2}\/[^"']+)\.js(["']\))/g, "$1$2.cjs$3")
        // from "./foo.js" -> from "./foo.cjs"
        .replace(/(from\s+["'])(\.{1,2}\/[^"']+)\.js(["'];?)/g, "$1$2.cjs$3");

      if (rewritten !== original) {
        fs.writeFileSync(fullPath, rewritten, "utf8");
      }
    }
  }
}

rewriteCjsImports(cjsDir);
