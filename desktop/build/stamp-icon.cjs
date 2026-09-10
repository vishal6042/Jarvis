// Put the Jarvis icon on the packaged .exe.
//
// electron-builder would normally do this itself, but only with `signAndEditExecutable` on -
// and turning that on makes it fetch the winCodeSign bundle, whose macOS symlinks Windows
// refuses to extract without Developer Mode or an elevated shell. So the flag stays off and we
// stamp the icon here with rcedit, which lives in that same cache and did extract.
//
// Without this the installed app keeps Electron's default atom icon in Explorer and on its
// shortcuts. (The running window and tray are unaffected either way - main.ts points those at
// build/icon.ico directly.)

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function stampIcon(context) {
  if (context.electronPlatformName !== "win32") return;

  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(__dirname, "icon.ico");
  const rcedit = findRcedit();

  if (!rcedit) {
    console.warn("  • stamp-icon: no rcedit in the electron-builder cache; the .exe keeps Electron's icon");
    return;
  }
  execFileSync(rcedit, [exe, "--set-icon", icon], { stdio: "inherit" });
  console.log(`  • stamp-icon: set icon.ico on ${path.basename(exe)}`);
};

/** The newest rcedit-x64.exe under %LOCALAPPDATA%\electron-builder\Cache\winCodeSign\<hash>\. */
function findRcedit() {
  const cache = path.join(process.env.LOCALAPPDATA ?? "", "electron-builder", "Cache", "winCodeSign");
  if (!fs.existsSync(cache)) return null;
  const found = fs
    .readdirSync(cache)
    .map((dir) => path.join(cache, dir, "rcedit-x64.exe"))
    .filter((candidate) => fs.existsSync(candidate));
  return found.length > 0 ? found[found.length - 1] : null;
}
