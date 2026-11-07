// Keep the earlier pages working alongside the new app:
//   /classic.html  - fitness-ring dashboard,  /details.html - run table,  /data/* - legacy JSON
import { cpSync, existsSync } from "node:fs";
cpSync("index.html", "dist/classic.html");
cpSync("details.html", "dist/details.html");
if (existsSync("data")) cpSync("data", "dist/data", { recursive: true });
console.log("legacy pages copied");
