/**
 * Build the self-contained ZALEANAI launcher: embeds out/** as resources and
 * compiles desktop/launcher/ZALEANAI.cs with the system C# compiler.
 *
 * Run `npm run build` first (or use `npm run dist:win`, which does both).
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const OUT_DIR = join(ROOT, "out");
const DIST_DIR = join(ROOT, "dist");
const EXE = join(DIST_DIR, "ZALEANAI.exe");
const LAUNCHER = join(ROOT, "desktop", "launcher", "ZALEANAI.cs");
const ICON = join(ROOT, "desktop", "icon.ico");
const RESPONSE_FILE = join(ROOT, "desktop", "build-exe.rsp");
const CSC =
    process.env.CSC ||
    join(
        process.env.WINDIR ?? "C:\\Windows",
        "Microsoft.NET",
        "Framework64",
        "v4.0.30319",
        "csc.exe",
    );

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function walk(dir) {
    const found = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...(await walk(full)));
        else found.push(full);
    }
    return found;
}

for (const [path, hint] of [
    [CSC, "找不到 C# 编译器，用环境变量 CSC 指定 csc.exe 的完整路径"],
    [LAUNCHER, "找不到 desktop/launcher/ZALEANAI.cs"],
    [ICON, "找不到 desktop/icon.ico（由 app/icon.png 生成）"],
    [join(OUT_DIR, "index.html"), "找不到 out/index.html，先运行 npm run build"],
]) {
    if (!(await exists(path))) {
        console.error(hint);
        console.error(path);
        process.exit(1);
    }
}

const files = (await walk(OUT_DIR)).filter((file) => {
    const rel = relative(OUT_DIR, file).split(sep).join("/");
    // The launcher serves config.json from the D: data folder; never ship the
    // developer demo config that may be sitting in public/.
    return rel !== "config.json";
});

const resources = files.map((file) => {
    const rel = relative(OUT_DIR, file).split(sep).join("/");
    return `-resource:${file},app/${rel}`;
});

const args = [
    "-nologo",
    "-target:winexe",
    "-optimize+",
    "-codepage:65001",
    `-out:${EXE}`,
    `-win32icon:${ICON}`,
    "-r:System.dll",
    "-r:System.Drawing.dll",
    "-r:System.Windows.Forms.dll",
    `-resource:${ICON},meta/icon.ico`,
    ...resources,
    LAUNCHER,
];

await mkdir(DIST_DIR, { recursive: true });
try {
    await rm(EXE);
} catch {
    // First build.
}

// csc on Windows has a ~32K command-line limit; a response file keeps this
// working as the Next export grows.
await writeFile(
    RESPONSE_FILE,
    args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`).join("\r\n") + "\r\n",
    "utf8",
);

console.log(`嵌入 ${files.length} 个静态文件 → ${EXE}`);

try {
    await run(CSC, ["@" + RESPONSE_FILE], { maxBuffer: 20 * 1024 * 1024 });
} catch (error) {
    console.error("编译失败：");
    console.error(error.stdout || "");
    console.error(error.stderr || error.message);
    process.exit(1);
}

const info = await stat(EXE);
console.log(`完成：${EXE}`);
console.log(
    `${files.length} 个文件内嵌其中，exe ${(info.size / 1024).toFixed(0)} KB，双击即可运行。`,
);
