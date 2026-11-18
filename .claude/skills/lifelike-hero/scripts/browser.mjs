// A Chromium that Playwright can drive, wherever this runs.
//
// The project's scripts (scripts/shot.mjs, stills.mjs, the checks) launch the browser that Playwright downloaded for
// itself. A cloud sandbox has no such download: it ships one Chromium of its own, and the scripts stop with
// "Executable doesn't exist". Loading this file first points every chromium.launch() at the browser that is there:
//
//   node --import ./.claude/skills/lifelike-hero/scripts/browser.mjs scripts/shot.mjs koi --soft
//
// Where Playwright's own browser is installed (a developer's machine) nothing is changed. CHROMIUM_PATH names a
// browser outright. The skill's own scripts import { chromium } from here.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// The project's Playwright (found from the working directory), not one near this file: a skill may be installed anywhere.
const require = createRequire(path.join(process.cwd(), 'package.json'));
let pw;
try { pw = require('playwright'); } catch { throw new Error('Playwright is not installed here. Run this from the project root, after npm install.'); }
export const { chromium } = pw;

const own = () => { try { return fs.existsSync(chromium.executablePath()); } catch { return false; } };
const other = [process.env.CHROMIUM_PATH, process.env.PLAYWRIGHT_BROWSERS_PATH && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'), '/opt/pw-browsers/chromium']
  .find((p) => p && fs.existsSync(p));
if (other && (process.env.CHROMIUM_PATH || !own())) {
  const launch = chromium.launch.bind(chromium);
  chromium.launch = (options = {}) => launch({ executablePath: other, ...options });
}

// Software rendering (SwiftShader): the same picture on every machine, GPU or none. Slow (about a frame a second on
// a heavy scene), so frame rates measured through it say nothing about a real GPU.
export const SOFT = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
