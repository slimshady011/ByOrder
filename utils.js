const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const PROJECT_DIR = __dirname;
const BIN_DIR = path.join(PROJECT_DIR, 'bin');
const FFMPEG_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

const FFMPEG_PATH = path.join(BIN_DIR, 'ffmpeg');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp');

// فارسی‌سازی پیام‌ها
const i18n = {
  fa: {
    error_download: 'خطا در دانلود فایل: %s',
    error_binary_invalid: 'فایل اجرایی %s نامعتبر است: %s',
    downloading_binary: 'در حال دانلود %s...',
    downloaded_binary: '%s با موفقیت دانلود شد.',
    setting_permissions: 'در حال تنظیم پرمیشن برای %s...',
    permissions_set: 'پرمیشن %s تنظیم شد.'
  }
};

async function ensureBinDir() {
  await fs.mkdir(BIN_DIR, { recursive: true });
}

async function downloadFile(url, destPath) {
  const writer = fssync.createWriteStream(destPath);
  const response = await axios.get(url, { responseType: 'stream' });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function extractFfmpegTar(tarPath) {
  await execPromise(`tar -xf "${tarPath}" -C "${BIN_DIR}"`);
  const files = await fs.readdir(BIN_DIR, { withFileTypes: true });
  for (const entry of files) {
    if (entry.isDirectory() && entry.name.startsWith("ffmpeg")) {
      const ffmpegFullPath = path.join(BIN_DIR, entry.name, 'ffmpeg');
      await fs.rename(ffmpegFullPath, FFMPEG_PATH);
      return;
    }
  }
  throw new Error('فایل ffmpeg یافت نشد.');
}

async function validateBinary(filePath, binaryName, lang = 'fa') {
  try {
    const versionArg = binaryName === 'yt-dlp' ? '--version' : '-version';
    const { stdout } = await execPromise(`"${filePath}" ${versionArg}`);
    if (!stdout.trim()) throw new Error('خروجی خالی است');
    console.log(`[Utils] ${binaryName} تایید شد: ${stdout.trim().split('\n')[0]}`);
    return true;
  } catch (err) {
    console.error(`[Utils] Validation failed for ${binaryName}: ${err.message}`);
    return false;
  }
}

async function setupBinaries(lang = 'fa') {
  await ensureBinDir();

  // ffmpeg
  if (!await validateBinary(FFMPEG_PATH, 'ffmpeg', lang)) {
    console.log(i18n[lang].downloading_binary.replace('%s', 'ffmpeg'));
    const tarPath = path.join(BIN_DIR, 'ffmpeg.tar.xz');
    await downloadFile(FFMPEG_URL, tarPath);
    await extractFfmpegTar(tarPath);
    await fs.chmod(FFMPEG_PATH, 0o755);
    await fs.unlink(tarPath);
    console.log(i18n[lang].downloaded_binary.replace('%s', 'ffmpeg'));
  }

  // yt-dlp
  if (!await validateBinary(YTDLP_PATH, 'yt-dlp', lang)) {
    console.log(i18n[lang].downloading_binary.replace('%s', 'yt-dlp'));
    await downloadFile(YTDLP_URL, YTDLP_PATH);
    await fs.chmod(YTDLP_PATH, 0o755);
    console.log(i18n[lang].downloaded_binary.replace('%s', 'yt-dlp'));
  }

  return { ffmpegPath: FFMPEG_PATH, ytdlpPath: YTDLP_PATH };
}

module.exports = {
  setupBinaries
};
