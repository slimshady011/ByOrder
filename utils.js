const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const axios = require('axios');
const unzipper = require('unzipper');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

// تنظیمات
const PROJECT_DIR = __dirname;
const BIN_DIR = path.join(PROJECT_DIR, 'bin');
const FFMPEG_ZIP_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
const DOWNLOAD_TIMEOUT_MS = 60000; // 60 ثانیه
const MIN_FILE_SIZE_BYTES = 1024 * 1024; // حداقل 1 مگابایت

// پیام‌ها (فارسی)
const i18n = {
  fa: {
    error_download: 'خطا در دانلود فایل: %s',
    error_permission: 'خطا در تنظیم پرمیشن فایل: %s',
    error_binary_invalid: 'فایل اجرایی %s نامعتبر است: %s',
    error_binary_missing: 'فایل اجرایی %s در مسیر %s یافت نشد',
    downloading_binary: 'در حال دانلود %s...',
    downloaded_binary: '%s با موفقیت دانلود شد.',
    setting_permissions: 'در حال تنظیم پرمیشن برای %s...',
    permissions_set: 'پرمیشن %s تنظیم شد.'
  }
};

// اطمینان از در دسترس بودن پوشه bin
async function ensureBinDir() {
  try {
    await fs.mkdir(BIN_DIR, { recursive: true });
    await fs.access(BIN_DIR, fs.constants.W_OK);
    console.log(`[Utils] Bin directory accessible: ${BIN_DIR}`);
  } catch (err) {
    throw new Error(`Cannot access bin directory: ${err.message}`);
  }
}

// دانلود فایل ZIP
async function downloadZip(url, destPath, lang = 'fa') {
  try {
    const writer = fssync.createWriteStream(destPath);
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: DOWNLOAD_TIMEOUT_MS
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', async () => {
        const stats = await fs.stat(destPath);
        if (stats.size < MIN_FILE_SIZE_BYTES) {
          await fs.unlink(destPath).catch(() => {});
          return reject(new Error('فایل دانلود شده ناقص است'));
        }
        resolve();
      });
      writer.on('error', reject);
    });
  } catch (err) {
    throw new Error(i18n[lang].error_download.replace('%s', err.message));
  }
}

// استخراج فایل ZIP و یافتن ffmpeg.exe
async function extractFfmpeg(zipPath, lang = 'fa') {
  try {
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: BIN_DIR }))
      .promise();

    const files = await fs.readdir(BIN_DIR, { withFileTypes: true });
    for (const entry of files) {
      if (entry.isDirectory()) {
        const innerFiles = await fs.readdir(path.join(BIN_DIR, entry.name));
        const ffmpegFile = innerFiles.find(f => f.toLowerCase() === 'ffmpeg.exe');
        if (ffmpegFile) {
          const src = path.join(BIN_DIR, entry.name, ffmpegFile);
          const dest = path.join(BIN_DIR, 'ffmpeg.exe');
          await fs.rename(src, dest);
          return dest;
        }
      }
    }
    throw new Error('ffmpeg.exe در فایل زیپ یافت نشد');
  } catch (err) {
    throw new Error(i18n[lang].error_download.replace('%s', err.message));
  }
}

// بررسی اجرایی بودن فایل
async function validateBinary(filePath, binaryName, lang = 'fa') {
  try {
    await fs.access(filePath);
    const versionArg = binaryName === 'yt-dlp' ? '--version' : '-version';
    const { stdout } = await execPromise(`"${filePath}" ${versionArg}`);
    if (!stdout || stdout.trim().length === 0) {
      throw new Error('خروجی خالی است');
    }
    console.log(`[Utils] ${binaryName} تایید شد: ${stdout.trim().split('\n')[0]}`);
    return true;
  } catch (err) {
    console.error(`[Utils] Validation failed for ${binaryName}: ${err.message}`);
    return false;
  }
}



// راه‌اندازی فایل‌های اجرایی
async function setupBinaries(lang = 'fa') {
  await ensureBinDir();

  const ffmpegPath = path.join(BIN_DIR, 'ffmpeg.exe');
  const ytdlpPath = path.join(BIN_DIR, 'yt-dlp.exe');
  const zipPath = path.join(BIN_DIR, 'ffmpeg.zip');

  // ffmpeg
  if (!await validateBinary(ffmpegPath, 'ffmpeg', lang)) {
    console.log(`[Utils] ${i18n[lang].downloading_binary.replace('%s', 'ffmpeg')}`);
    await downloadZip(FFMPEG_ZIP_URL, zipPath, lang);
    await extractFfmpeg(zipPath, lang);
    await fs.unlink(zipPath).catch(() => {});
    if (!await validateBinary(ffmpegPath, 'ffmpeg', lang)) {
      throw new Error(i18n[lang].error_binary_invalid.replace('%s', 'ffmpeg').replace('%s', 'تایید نهایی شکست خورد'));
    }
    console.log(`[Utils] ${i18n[lang].downloaded_binary.replace('%s', 'ffmpeg')}`);
  }

  // yt-dlp
  try {
    if (!await validateBinary(ytdlpPath, 'yt-dlp', lang)) {
      throw new Error('yt-dlp.exe یافت نشد یا معتبر نیست');
    }
  } catch (err) {
    throw new Error(i18n[lang].error_binary_invalid.replace('%s', 'yt-dlp').replace('%s', err.message));
  }

  return { ffmpegPath, ytdlpPath };
}

module.exports = {
  setupBinaries
};
